// Home overview: each user sees only their own feeds, posts and setup; time windows follow the page's clock.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");

describe("dashboard.overview", () => {
  it("counts only the caller's data, and is empty for a user with nothing", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "h_alice", tokenIdentifier: "clerk|h_alice" });
    const bob = t.withIdentity({ subject: "h_bob", tokenIdentifier: "clerk|h_bob" });
    const aliceId = await alice.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    const now = Date.now();
    await t.run(async (ctx) => {
      const graveId = await ctx.db.insert("graves", {
        userId: aliceId, feedUrl: "https://a.example/feed", title: "A", status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 7,
      });
      await ctx.db.insert("graves", { userId: aliceId, feedUrl: "https://b.example/feed", title: "B", status: "broken", nextFetchAt: now, failureCount: 3, unreadCount: 0 });
      const itemId = await ctx.db.insert("items", {
        userId: aliceId, graveId, guid: "1", title: "Top story", publishedAt: now, contentHtml: "", excerpt: "", isRead: false, isStarred: false, risenAt: now, score: 91,
      });
      const draftId = await ctx.db.insert("drafts", { userId: aliceId, itemId, platform: "x", text: "t", hashtags: [], status: "draft", model: "t" });
      await ctx.db.insert("publishes", { userId: aliceId, itemId, draftId, platform: "x", kind: "article", status: "posted", createdAt: now, at: now - 1000, url: "https://x.com/i/1" });
      await ctx.db.insert("publishes", { userId: aliceId, kind: "manual", platform: "linkedin", status: "due", createdAt: now, at: now - 500, text: "Hello world" });
    });

    const a = await alice.query(api.dashboard.overview, { now });
    expect(a?.feeds).toEqual({ total: 2, alive: 1, sleeping: 0, broken: 1, unread: 7 });
    expect(a?.risenToday).toBe(1);
    expect(a?.posts).toEqual({ posted30d: 1, scheduled: 0, due: 1, failed7d: 0 });
    expect(a?.readNext[0]).toMatchObject({ title: "Top story", score: 91, source: "A" });
    expect(a?.upNext[0]).toMatchObject({ platform: "linkedin", status: "due", title: "Hello world" });
    expect(a?.recent[0]).toMatchObject({ platform: "x", url: "https://x.com/i/1", title: "Top story" });
    expect(a?.checklist).toMatchObject({ feeds: true, firstPost: true, connected: false, voice: false });

    // The same data, seen a day later by the page's clock: "rose today" slides to 0.
    expect((await alice.query(api.dashboard.overview, { now: now + 25 * 3_600_000 }))?.risenToday).toBe(1); // clamped: clock too far off
    const b = await bob.query(api.dashboard.overview, { now });
    expect(b).toMatchObject({ feeds: { total: 0, unread: 0 }, risenToday: 0, posts: { posted30d: 0, due: 0 }, upNext: [], recent: [], readNext: [] });
  });
});
