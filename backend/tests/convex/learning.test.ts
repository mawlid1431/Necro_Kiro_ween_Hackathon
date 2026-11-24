// Learning memory: built only from the user's own actions, reaches the Séance prompt, and can be turned off or reset.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");

describe("learning memory", () => {
  it("learns from stars, feeds the Séance context, and respects off and reset", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "h_alice", tokenIdentifier: "clerk|h_alice" });
    const bob = t.withIdentity({ subject: "h_bob", tokenIdentifier: "clerk|h_bob" });
    const aliceId = await alice.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const graveId = await ctx.db.insert("graves", { userId: aliceId, feedUrl: "https://s.example/feed", title: "Sec Weekly", status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 0 });
      const titles = ["Ransomware hits hospitals", "New ransomware strain spreads", "How ransomware gangs negotiate", "A cake recipe"];
      return Promise.all(
        titles.map((title, i) =>
          ctx.db.insert("items", { userId: aliceId, graveId, guid: `g${i}`, title, publishedAt: now, contentHtml: "", excerpt: "", isRead: false, isStarred: false, risenAt: now, topic: i < 3 ? "security" : "other" }),
        ),
      );
    });

    expect((await alice.query(api.learning.mine, {})).promptLine).toBeNull(); // nothing learned yet: nothing sent
    for (const itemId of ids.slice(0, 3)) await alice.mutation(api.items.setStarred, { itemId, value: true });
    await t.mutation(internal.learning.refresh, { userId: aliceId });

    const mine = await alice.query(api.learning.mine, {});
    expect(mine.learned?.topics).toEqual([{ topic: "security", share: 100 }]);
    expect(mine.learned?.terms).toContain("ransomware");
    expect(mine.learned?.feeds).toEqual(["Sec Weekly"]);
    const ctx = await t.query(internal.seances.context, { userId: aliceId, itemId: ids[3] });
    expect(ctx.learned).toMatch(/^Learned from this reader's own activity \(3 actions/);
    expect((await bob.query(api.learning.mine, {})).learned).toBeNull(); // never crosses users

    await alice.mutation(api.learning.setEnabled, { enabled: false });
    expect((await t.query(internal.seances.context, { userId: aliceId, itemId: ids[3] })).learned).toBeNull();
    await alice.mutation(api.learning.setEnabled, { enabled: true });
    await alice.mutation(api.learning.reset, {});
    await t.mutation(internal.learning.refresh, { userId: aliceId });
    expect((await alice.query(api.learning.mine, {})).learned?.signals).toBe(0); // stars before the reset are forgotten
  });
});

describe("learning memory refresh", () => {
  it("counts every action: quick actions share one refresh, later ones queue a new one", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "h_alice", tokenIdentifier: "clerk|h_alice" });
    const aliceId = await alice.mutation(api.users.store, {});
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const graveId = await ctx.db.insert("graves", { userId: aliceId, feedUrl: "https://s.example/feed", title: "Sec", status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 0 });
      return Promise.all([0, 1, 2, 3].map((i) =>
        ctx.db.insert("items", { userId: aliceId, graveId, guid: `g${i}`, title: `Ransomware story ${i}`, publishedAt: now, contentHtml: "", excerpt: "", isRead: false, isStarred: false, risenAt: now, topic: "security" })));
    });
    for (const itemId of ids.slice(0, 3)) await alice.mutation(api.items.setStarred, { itemId, value: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await alice.query(api.learning.mine, {})).learned?.signals).toBe(3);
    await alice.mutation(api.items.setStarred, { itemId: ids[3], value: true }); // a later action is not lost
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await alice.query(api.learning.mine, {})).learned?.signals).toBe(4);
    vi.useRealTimers();
  });
});
