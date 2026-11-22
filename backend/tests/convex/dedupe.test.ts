// One post, once: every path that creates or sends a post refuses a duplicate, per user and platform,
// atomically. Plus the stuck-post sweep, fair-use cap and isolation between users.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { articleKey, manualKey, normalizeCaption } from "../../lib/social/dedupe";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "d_alice", tokenIdentifier: "clerk|d_alice" });
  const bob = t.withIdentity({ subject: "d_bob", tokenIdentifier: "clerk|d_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const mkItem = (userId: Id<"users">, guid: string) =>
    t.run(async (ctx) => {
      const now = Date.now();
      const graveId = await ctx.db.insert("graves", {
        userId, feedUrl: `https://blog.example/${guid}`, siteUrl: "https://blog.example", title: "Example", status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 0,
      });
      const itemId = await ctx.db.insert("items", {
        userId, graveId, guid, title: "Post", link: "https://blog.example/p", publishedAt: now, contentHtml: "<p>x</p>", excerpt: "x", isRead: false, isStarred: false, risenAt: now,
      });
      const x = await ctx.db.insert("drafts", { userId, itemId, platform: "x", text: "Read this", hashtags: [], status: "draft", model: "t" });
      return { itemId, x };
    });
  const a = await mkItem(aliceId, "a1");
  const png = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
  await alice.mutation(api.social.registerUpload, { storageId: png });
  return { t, alice, bob, aliceId, bobId, ...a, png };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("keys", () => {
  it("treat trivial edits as the same caption, and different images or platforms as different posts", () => {
    expect(normalizeCaption("  Hello   World \n")).toBe("hello world");
    expect(manualKey("x", "Hello world", "img1")).toBe(manualKey("x", " hello  WORLD ", "img1"));
    expect(manualKey("x", "Hello world", "img1")).not.toBe(manualKey("x", "Hello world", "img2"));
    expect(manualKey("x", "Hello world")).not.toBe(manualKey("linkedin", "Hello world"));
    expect(articleKey("i1", "x")).not.toBe(articleKey("i1", "linkedin"));
  });
});

describe("one post, once", () => {
  it("an article cannot be scheduled twice for the same platform, nor after it was posted", async () => {
    const { t, alice, x } = await setup();
    const at = Date.now() + HOUR;
    const first = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "One", at });
    await expect(alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Edited text", at: at + HOUR })).rejects.toThrow(/Already scheduled for X/);

    // The reminder comes due and is shared: now it is posted, and the same post is refused for good.
    vi.advanceTimersByTime(HOUR + 1000);
    await t.finishInProgressScheduledFunctions();
    await alice.mutation(api.social.markShared, { publishId: first.publishId });
    await expect(alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "Again", at: Date.now() + HOUR })).rejects.toThrow(/Already posted to X/);
  });

  it("Post now refuses an article that is posted, going out, or scheduled (double clicks included)", async () => {
    const { t, aliceId, itemId, x } = await setup();
    const start = () => t.mutation(internal.social.startPublish, { userId: aliceId, itemId, draftId: x, platform: "x" });
    const id = await start();
    await expect(start()).rejects.toThrow(/already going out/); // second click while the first is sending
    await t.mutation(internal.social.finishPublish, { publishId: id, status: "posted", url: "https://x.com/i/1" });
    await expect(start()).rejects.toThrow(/Already posted to X/);
  });

  it("a cancelled or failed post can be tried again", async () => {
    const { t, alice, aliceId, itemId, x } = await setup();
    const { publishId } = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "One", at: Date.now() + HOUR });
    await alice.mutation(api.social.cancelScheduled, { publishId });
    const id = await t.mutation(internal.social.startPublish, { userId: aliceId, itemId, draftId: x, platform: "x" });
    await t.mutation(internal.social.finishPublish, { publishId: id, status: "failed", error: "nope" });
    await expect(t.mutation(internal.social.startPublish, { userId: aliceId, itemId, draftId: x, platform: "x" })).resolves.toBeTruthy();
  });

  it("the composer refuses the same caption + image on the same account, but allows a new caption or another account", async () => {
    const { alice, png } = await setup();
    await alice.mutation(api.social.composePost, { caption: "Golden hour", platforms: ["x"], storageId: png, at: Date.now() + HOUR });
    await expect(alice.mutation(api.social.composePost, { caption: "  golden   HOUR ", platforms: ["x"], storageId: png, at: Date.now() + 2 * HOUR })).rejects.toThrow(/Already scheduled for X/);
    // Nothing is half-created when one platform of several is a duplicate.
    await expect(alice.mutation(api.social.composePost, { caption: "Golden hour", platforms: ["linkedin", "x"], storageId: png })).rejects.toThrow(/X/);
    await expect(alice.mutation(api.social.composePost, { caption: "Golden hour", platforms: ["linkedin"], storageId: png, at: Date.now() + HOUR })).resolves.toHaveLength(1);
    await expect(alice.mutation(api.social.composePost, { caption: "A different caption", platforms: ["x"], storageId: png, at: Date.now() + HOUR })).resolves.toHaveLength(1);
  });

  it("a scheduled job does not send a post whose twin already went out meanwhile", async () => {
    const { t, alice, aliceId, x, itemId } = await setup();
    const { publishId } = await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "One", at: Date.now() + HOUR });
    // Simulate the same post having gone out by another route (e.g. an older client).
    await t.run((ctx) =>
      ctx.db.insert("publishes", { userId: aliceId, itemId, draftId: x, platform: "x", kind: "article", status: "posted", createdAt: Date.now(), at: Date.now(), contentKey: articleKey(itemId, "x") }),
    );
    vi.advanceTimersByTime(HOUR + 1000);
    await t.finishInProgressScheduledFunctions();
    const row = await t.run((ctx) => ctx.db.get(publishId));
    expect(row).toMatchObject({ status: "canceled", note: "duplicate" });
  });

  it("each user has their own posts: the same article id or caption never blocks another user", async () => {
    const { bob, png } = await setup();
    // Bob cannot use Alice's image, and his own identical caption is independent of hers.
    await expect(bob.mutation(api.social.composePost, { caption: "Golden hour", platforms: ["x"], storageId: png })).rejects.toThrow(/could not be found/);
    await expect(bob.mutation(api.social.composePost, { caption: "Golden hour", platforms: ["x"], at: Date.now() + HOUR })).resolves.toHaveLength(1);
    expect(await bob.query(api.social.timeline, { from: Date.now() - 24 * HOUR, to: Date.now() + 2 * HOUR })).toHaveLength(1);
  });
});

describe("reliability", () => {
  it("a post stuck in 'posting' for 15 minutes is marked failed (never retried) by the sweep", async () => {
    const { t, aliceId, itemId, x } = await setup();
    const id = await t.mutation(internal.social.startPublish, { userId: aliceId, itemId, draftId: x, platform: "x" });
    vi.advanceTimersByTime(10 * 60_000);
    expect(await t.mutation(internal.social.sweepStuck, {})).toBe(0);
    vi.advanceTimersByTime(6 * 60_000);
    expect(await t.mutation(internal.social.sweepStuck, {})).toBe(1);
    const row = await t.run((ctx) => ctx.db.get(id as Id<"publishes">));
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/could not confirm/);
  });

  it("fair use: at most 60 posts or reminders created per hour", async () => {
    const { alice } = await setup();
    for (let i = 0; i < 15; i++) {
      await alice.mutation(api.social.composePost, { caption: `Post ${i}`, platforms: ["x", "linkedin", "instagram", "tiktok"].slice(0, 2) as ("x" | "linkedin")[], at: Date.now() + HOUR + i * 60_000 });
    }
    // 30 rows so far; 30 more fit, then the cap refuses.
    for (let i = 15; i < 30; i++) await alice.mutation(api.social.composePost, { caption: `Post ${i}`, platforms: ["x", "linkedin"], at: Date.now() + HOUR });
    await expect(alice.mutation(api.social.composePost, { caption: "One too many", platforms: ["x"], at: Date.now() + HOUR })).rejects.toThrow(/60 posts or reminders an hour/);
  });

  it("postStateForItem reports, live, what an article has on each platform", async () => {
    const { t, alice, aliceId, itemId, x } = await setup();
    const at = Date.now() + HOUR;
    await alice.mutation(api.social.schedule, { draftId: x, platform: "x", text: "One", at });
    let st = await alice.query(api.social.postStateForItem, { itemId });
    expect(st.find((s) => s.platform === "x")?.pending).toMatchObject({ status: "scheduled", at });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("publishes").collect();
      for (const r of rows) await ctx.db.patch(r._id, { status: "posted", url: "https://x.com/i/9" });
    });
    st = await alice.query(api.social.postStateForItem, { itemId });
    expect(st.find((s) => s.platform === "x")?.posted).toMatchObject({ url: "https://x.com/i/9" });
    expect(st.find((s) => s.platform === "x")?.pending).toBeUndefined();
    expect(await t.withIdentity({ subject: "d_bob", tokenIdentifier: "clerk|d_bob" }).query(api.social.postStateForItem, { itemId })).toEqual([]);
    void aliceId;
  });
});
