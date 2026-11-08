// Backend tests with convex-test: user isolation, ingest dedupe, unread counts, AI limits.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");

function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "user_alice", tokenIdentifier: "clerk|user_alice", name: "Alice", email: "a@x.test" });
  const bob = t.withIdentity({ subject: "user_bob", tokenIdentifier: "clerk|user_bob", name: "Bob", email: "b@x.test" });
  return { t, alice, bob };
}

const item = (guid: string, publishedAt = Date.now()) => ({
  guid,
  title: `Item ${guid}`,
  link: `https://feed.test/${guid}`,
  author: null,
  publishedAt,
  contentHtml: `<p>Body ${guid}</p>`,
  excerpt: `Body ${guid}`,
});

async function graveFor(t: ReturnType<typeof convexTest>, userId: Id<"users">, feedUrl = "https://feed.test/rss") {
  return await t.mutation(internal.graves.create, { userId, feedUrl, title: "Feed" });
}

describe("user isolation", () => {
  it("one user cannot read or change another user's graves and items", async () => {
    const { t, alice, bob } = setup();
    const aliceId = await alice.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    const graveId = await graveFor(t, aliceId);
    await t.mutation(internal.items.ingest, { userId: aliceId, graveId, items: [item("a1")], fetchedAt: Date.now(), firstFetch: false });

    expect(await alice.query(api.graves.list, {})).toHaveLength(1);
    expect(await bob.query(api.graves.list, {})).toHaveLength(0);

    const page = await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 10, cursor: null } });
    const itemId = page.page[0]._id;

    await expect(bob.query(api.items.get, { itemId })).rejects.toThrow(/could not be found/);
    await expect(bob.query(api.graves.get, { graveId })).rejects.toThrow(/could not be found/);
    await expect(bob.mutation(api.items.setStarred, { itemId, value: true })).rejects.toThrow(/could not be found/);
    await expect(bob.mutation(api.graves.layToRest, { graveId })).rejects.toThrow(/could not be found/);
    await expect(bob.query(api.items.list, { graveId, filter: "all", paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
    expect(await bob.query(api.items.search, { query: "Item" })).toHaveLength(0);

    // Alice's data is untouched.
    expect((await alice.query(api.items.get, { itemId })).isStarred).toBe(false);
  });

  it("signed-out callers get nothing", async () => {
    const { t } = setup();
    expect(await t.query(api.graves.list, {})).toEqual([]);
    expect(await t.query(api.users.me, {})).toBeNull();
    await expect(t.mutation(api.users.setInterests, { interests: ["rss"] })).rejects.toThrow(/sign in/);
  });
});

describe("ingest", () => {
  it("dedupes by guid, keeps unreadCount in sync and marks old items read on first fetch", async () => {
    const { t, alice } = setup();
    const userId = await alice.mutation(api.users.store, {});
    const graveId = await graveFor(t, userId);
    const now = Date.now();
    const old = now - 30 * 86_400_000;

    const r1 = await t.mutation(internal.items.ingest, {
      userId, graveId, items: [item("n1", now), item("old", old)], fetchedAt: now, firstFetch: true,
    });
    const r2 = await t.mutation(internal.items.ingest, {
      userId, graveId, items: [item("n1", now), item("n2", now)], fetchedAt: now, firstFetch: false,
    });
    expect(r1.inserted).toBe(2);
    expect(r2.inserted).toBe(1);

    let [grave] = await alice.query(api.graves.list, {});
    expect(grave.unreadCount).toBe(2); // n1 + n2; "old" was marked read

    const unread = await alice.query(api.items.list, { filter: "unread", paginationOpts: { numItems: 10, cursor: null } });
    await alice.mutation(api.items.setRead, { itemId: unread.page[0]._id, value: true });
    await alice.mutation(api.items.setRead, { itemId: unread.page[0]._id, value: true }); // idempotent
    [grave] = await alice.query(api.graves.list, {});
    expect(grave.unreadCount).toBe(1);

    expect(await alice.mutation(api.items.markAllRead, {})).toBe(1);
    [grave] = await alice.query(api.graves.list, {});
    expect(grave.unreadCount).toBe(0);
  });

  it("does not create a second grave for the same feed", async () => {
    const { t, alice } = setup();
    const userId = await alice.mutation(api.users.store, {});
    const a = await graveFor(t, userId);
    const b = await graveFor(t, userId);
    expect(a).toBe(b);
  });
});

describe("AI limits", () => {
  it("reserve enforces the daily Séance limit and release refunds it", async () => {
    const { t, alice } = setup();
    const userId = await alice.mutation(api.users.store, {});
    let last: Id<"aiUsage"> | undefined;
    for (let i = 0; i < 100; i++) last = await t.mutation(internal.aiUsage.reserve, { userId, task: "seance" });
    await expect(t.mutation(internal.aiUsage.reserve, { userId, task: "seance" })).rejects.toThrow(/today/);
    await t.mutation(internal.aiUsage.release, { usageId: last! });
    await expect(t.mutation(internal.aiUsage.reserve, { userId, task: "seance" })).resolves.toBeTruthy();
    const usage = await alice.query(api.usage.today, {});
    expect(usage?.seance).toEqual({ used: 100, limit: 100 });
  });
});

describe("api keys", () => {
  it("never lists hashes and only the owner can revoke", async () => {
    const { t, alice, bob } = setup();
    const aliceId = await alice.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    await t.mutation(internal.apiKeys.insert, { userId: aliceId, name: "Laptop", hash: "h".repeat(64), prefix: "necro_sk_abcdefgh" });
    const [key] = await alice.query(api.apiKeys.list, {});
    expect(key).not.toHaveProperty("hash");
    await expect(bob.mutation(api.apiKeys.revoke, { keyId: key._id })).rejects.toThrow(/could not be found/);
    await alice.mutation(api.apiKeys.revoke, { keyId: key._id });
    expect((await alice.query(api.apiKeys.list, {}))[0].revokedAt).toBeTypeOf("number");
  });
});
