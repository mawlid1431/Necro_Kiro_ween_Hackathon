// Witching Hour: scheduled posts and reminders, the scheduled job, cancel/move/mark shared, timeline and isolation.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "s_alice", tokenIdentifier: "clerk|s_alice" });
  const bob = t.withIdentity({ subject: "s_bob", tokenIdentifier: "clerk|s_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  await bob.mutation(api.users.store, {});
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const graveId = await ctx.db.insert("graves", {
      userId: aliceId, feedUrl: "https://blog.example/feed", siteUrl: "https://blog.example", title: "Example Blog",
      status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 0,
    });
    const itemId = await ctx.db.insert("items", {
      userId: aliceId, graveId, guid: "g1", title: "RSS is back", link: "https://blog.example/rss-is-back", publishedAt: now,
      contentHtml: "<p>Hi</p>", excerpt: "Hi", isRead: false, isStarred: false, risenAt: now,
    });
    const mk = (platform: "linkedin" | "x" | "instagram", text: string) =>
      ctx.db.insert("drafts", { userId: aliceId, itemId, platform, text, hashtags: ["#rss"], status: "draft", model: "test" });
    return { itemId, linkedin: await mk("linkedin", "LinkedIn draft"), x: await mk("x", "X draft"), instagram: await mk("instagram", "Caption") };
  });
  return { t, alice, bob, aliceId, ...ids };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  delete process.env.LINKEDIN_CLIENT_ID;
  delete process.env.LINKEDIN_CLIENT_SECRET;
});

describe("scheduling", () => {
  it("without a connection, schedules a reminder that turns due at its time", async () => {
    const { t, alice, x } = await setup();
    const at = Date.now() + HOUR;
    const r = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Edited for later", at });
    expect(r.mode).toBe("reminder");

    let tl = await alice.query(api.social.timeline, { from: at - HOUR, to: at + HOUR });
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ status: "scheduled", mode: "reminder", platform: "x", itemTitle: "RSS is back", source: "Example Blog" });
    expect(tl[0].post).toBe("Edited for later\n\nhttps://blog.example/rss-is-back\n\n#rss"); // the exact shared text

    vi.advanceTimersByTime(HOUR + 1000);
    await t.finishInProgressScheduledFunctions();
    tl = await alice.query(api.social.timeline, { from: at - HOUR, to: at + HOUR });
    expect(tl[0].status).toBe("due");
    expect(await alice.query(api.social.dueReminders, {})).toHaveLength(1);

    await alice.mutation(api.social.markShared, { publishId: tl[0]._id });
    tl = await alice.query(api.social.timeline, { from: at - HOUR, to: at + HOUR });
    expect(tl[0].status).toBe("posted");
    expect(await alice.query(api.social.dueReminders, {})).toHaveLength(0);
  });

  it("TikTok is always a reminder; a connected LinkedIn is automatic", async () => {
    const { t, alice, aliceId, instagram, linkedin } = await setup();
    const at = Date.now() + HOUR;
    expect((await alice.mutation(api.social.schedule, { draftId: instagram, platform: "tiktok", text: "Caption", at })).mode).toBe("reminder");

    process.env.LINKEDIN_CLIENT_ID = "id";
    process.env.LINKEDIN_CLIENT_SECRET = "secret";
    await t.run((ctx) =>
      ctx.db.insert("connections", { userId: aliceId, platform: "linkedin", accountId: "p1", accessToken: "sealed", status: "active", connectedAt: Date.now() }),
    );
    expect((await alice.mutation(api.social.schedule, { draftId: linkedin, platform: "linkedin", text: "Post", at })).mode).toBe("auto");
  });

  it("cancel stops the job; reschedule moves it", async () => {
    const { t, alice, x } = await setup();
    const at = Date.now() + HOUR;
    const { publishId } = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "One", at });
    await alice.mutation(api.social.reschedule, { publishId, at: at + 2 * HOUR });
    vi.advanceTimersByTime(HOUR + 1000);
    await t.finishInProgressScheduledFunctions();
    let row = await t.run((ctx) => ctx.db.get(publishId as Id<"publishes">));
    expect(row?.status).toBe("scheduled"); // the old time did nothing
    expect(row?.at).toBe(at + 2 * HOUR);

    await alice.mutation(api.social.cancelScheduled, { publishId });
    vi.advanceTimersByTime(3 * HOUR);
    await t.finishInProgressScheduledFunctions();
    row = await t.run((ctx) => ctx.db.get(publishId as Id<"publishes">));
    expect(row?.status).toBe("canceled");
  });

  it("an auto post whose account was disconnected fails with a clear message", async () => {
    const { t, alice, aliceId, linkedin } = await setup();
    process.env.LINKEDIN_CLIENT_ID = "id";
    process.env.LINKEDIN_CLIENT_SECRET = "secret";
    const connId = await t.run((ctx) =>
      ctx.db.insert("connections", { userId: aliceId, platform: "linkedin", accountId: "p1", accessToken: "sealed", status: "active", connectedAt: Date.now() }),
    );
    const { publishId } = await alice.mutation(api.social.schedule, { draftId: linkedin, platform: "linkedin", text: "Post", at: Date.now() + HOUR });
    await t.run((ctx) => ctx.db.delete(connId));
    await t.action(internal.socialNode.runScheduled, { publishId });
    const row = await t.run((ctx) => ctx.db.get(publishId as Id<"publishes">));
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/not connected any more/);
  });

  it("refuses bad times, other users' drafts, and other users' posts", async () => {
    const { alice, bob, x } = await setup();
    await expect(alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Now", at: Date.now() + 1000 })).rejects.toThrow(/at least a minute/);
    await expect(alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Far", at: Date.now() + 100 * 24 * HOUR })).rejects.toThrow(/90 days/);
    await expect(bob.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Mine?", at: Date.now() + HOUR })).rejects.toThrow();
    const { publishId } = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Ok", at: Date.now() + HOUR });
    await expect(bob.mutation(api.social.cancelScheduled, { publishId })).rejects.toThrow(/could not be found/);
    expect(await bob.query(api.social.timeline, { from: 0, to: Date.now() + 2 * HOUR })).toHaveLength(0);
  });
});

describe("composer (manual posts)", () => {
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: "image/png" });

  it("registers only the owner's JPG/PNG uploads, and posts one entry per chosen account", async () => {
    const { t, alice, bob } = await setup();
    const storageId = await t.run((ctx) => ctx.storage.store(png()));
    const up = await alice.mutation(api.social.registerUpload, { storageId });
    expect(up.contentType).toBe("image/png");

    await expect(bob.mutation(api.social.composePost, { caption: "Mine now", platforms: ["x"], storageId })).rejects.toThrow(/could not be found/);
    const at = Date.now() + HOUR;
    const res = await alice.mutation(api.social.composePost, { caption: "Sunset over Hargeisa\nGolden hour.", platforms: ["x", "instagram", "tiktok"], storageId, at });
    expect(res.map((r) => [r.platform, r.mode])).toEqual([["x", "reminder"], ["instagram", "reminder"], ["tiktok", "reminder"]]);

    const tl = await alice.query(api.social.timeline, { from: at - HOUR, to: at + HOUR });
    expect(tl).toHaveLength(3);
    expect(tl[0]).toMatchObject({ kind: "manual", itemTitle: "Sunset over Hargeisa", post: "Sunset over Hargeisa\nGolden hour.", status: "scheduled" });
    expect(tl[0].imageUrl).toBeTruthy();
  });

  it("refuses non-images, missing images for Instagram/TikTok, and too-long captions", async () => {
    const { t, alice } = await setup();
    const txt = await t.run((ctx) => ctx.storage.store(new Blob(["hello"], { type: "text/plain" })));
    await expect(alice.mutation(api.social.registerUpload, { storageId: txt })).rejects.toThrow(/JPG or PNG/);
    await expect(alice.mutation(api.social.composePost, { caption: "No picture", platforms: ["instagram"] })).rejects.toThrow(/needs an image/);
    await expect(alice.mutation(api.social.composePost, { caption: "x".repeat(300), platforms: ["x"] })).rejects.toThrow(/too long for X/);
    await expect(alice.mutation(api.social.composePost, { caption: "Hi", platforms: [] })).rejects.toThrow(/at least one account/);
  });

  it("Post now with no connection becomes a reminder that is due at once", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.social.composePost, { caption: "Right now", platforms: ["linkedin"] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await alice.query(api.social.dueReminders, {})).toEqual([expect.objectContaining({ platform: "linkedin", itemTitle: "Right now" })]);
  });
});
