// MCP Convex functions: secret guard, key auth, rate limit, revocation and user isolation.
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");
const SECRET = "s".repeat(40);
const ALICE_HASH = "a".repeat(64);
const BOB_HASH = "b".repeat(64);

beforeAll(() => {
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.MCP_SERVER_SECRET;
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "u_alice", tokenIdentifier: "clerk|u_alice" });
  const bob = t.withIdentity({ subject: "u_bob", tokenIdentifier: "clerk|u_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  await t.mutation(internal.apiKeys.insert, { userId: aliceId, name: "a", hash: ALICE_HASH, prefix: "necro_sk_aaaaaaaa" });
  await t.mutation(internal.apiKeys.insert, { userId: bobId, name: "b", hash: BOB_HASH, prefix: "necro_sk_bbbbbbbb" });
  const graveId = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://f.test/rss", title: "Alice Feed" });
  await t.mutation(internal.items.ingest, {
    userId: aliceId, graveId, fetchedAt: Date.now(), firstFetch: false,
    items: [{ guid: "1", title: "Convex agents rise", link: "https://f.test/1", author: null, publishedAt: Date.now(), contentHtml: "<p>Hello <b>dead</b> web &amp; friends</p>", excerpt: "Hello dead web" }],
  });
  const [{ _id: itemId }] = (await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 1, cursor: null } })).page;
  return { t, aliceId, bobId, graveId, itemId: itemId as Id<"items"> };
}

describe("MCP auth", () => {
  it("rejects a wrong server secret", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.mcp.authenticate, { hash: ALICE_HASH, secret: "x".repeat(40) })).rejects.toThrow(/Forbidden/);
  });

  it("resolves a key to its user and rejects unknown or revoked keys", async () => {
    const { t, aliceId } = await setup();
    expect(await t.mutation(api.mcp.authenticate, { hash: ALICE_HASH, secret: SECRET })).toMatchObject({ ok: true, userId: aliceId, prefix: "necro_sk_aaaaaaaa" });
    expect(await t.mutation(api.mcp.authenticate, { hash: "c".repeat(64), secret: SECRET })).toEqual({ ok: false, status: 401 });
    expect(await t.mutation(api.mcp.authenticate, { hash: "not-a-hash", secret: SECRET })).toEqual({ ok: false, status: 401 });

    const alice = t.withIdentity({ subject: "u_alice", tokenIdentifier: "clerk|u_alice" });
    const [key] = await alice.query(api.apiKeys.list, {});
    await alice.mutation(api.apiKeys.revoke, { keyId: key._id });
    expect(await t.mutation(api.mcp.authenticate, { hash: ALICE_HASH, secret: SECRET })).toEqual({ ok: false, status: 401 });
  });

  it("allows 60 calls a minute per key, then 429", async () => {
    const { t } = await setup();
    for (let i = 0; i < 60; i++) expect((await t.mutation(api.mcp.authenticate, { hash: BOB_HASH, secret: SECRET })).ok).toBe(true);
    expect(await t.mutation(api.mcp.authenticate, { hash: BOB_HASH, secret: SECRET })).toEqual({ ok: false, status: 429 });
    expect((await t.mutation(api.mcp.authenticate, { hash: ALICE_HASH, secret: SECRET })).ok).toBe(true); // per key
  });
});

describe("MCP tools", () => {
  it("return the key owner's data, marked as untrusted, with plain text only", async () => {
    const { t, aliceId, graveId, itemId } = await setup();
    const g = { secret: SECRET, userId: aliceId };
    expect(await t.query(api.mcp.listGraves, g)).toEqual([
      { id: graveId, title: "Alice Feed", feedUrl: "https://f.test/rss", status: "alive", unreadCount: 1, folder: null },
    ]);
    const page = await t.query(api.mcp.listItems, { ...g, filter: "unread", paginationOpts: { numItems: 20, cursor: null } });
    expect(page.items[0]).toMatchObject({ id: itemId, title: "Convex agents rise", feed: "Alice Feed", source: "untrusted web content" });
    expect(page.nextCursor).toBeNull();
    const item = await t.query(api.mcp.getItem, { ...g, itemId });
    expect(item.text).toBe("Hello dead web & friends");
    expect((await t.query(api.mcp.searchItems, { ...g, query: "agents", limit: 10 }))[0].id).toBe(itemId);
    expect(await t.query(api.mcp.getStats, g)).toMatchObject({ feeds: 1, unread: 1, starred: 0, brokenFeeds: 0 });
    expect(await t.query(api.mcp.getBriefing, g)).toBeNull();
    expect(await t.query(api.mcp.listKindred, { ...g, limit: 10 })).toEqual([]);
  });

  it("never let one key read another user's rows", async () => {
    const { t, bobId, graveId, itemId } = await setup();
    const g = { secret: SECRET, userId: bobId };
    expect(await t.query(api.mcp.listGraves, g)).toEqual([]);
    await expect(t.query(api.mcp.getItem, { ...g, itemId })).rejects.toThrow(/could not be found/);
    await expect(t.query(api.mcp.getGrave, { ...g, graveId })).rejects.toThrow(/could not be found/);
    expect(await t.query(api.mcp.searchItems, { ...g, query: "agents", limit: 10 })).toEqual([]);
  });

  it("require the server secret on every function", async () => {
    const { t, aliceId } = await setup();
    await expect(t.query(api.mcp.listGraves, { secret: "nope", userId: aliceId })).rejects.toThrow(/Forbidden/);
    await expect(t.query(api.mcp.getStats, { secret: "", userId: aliceId })).rejects.toThrow(/Forbidden/);
  });
});
