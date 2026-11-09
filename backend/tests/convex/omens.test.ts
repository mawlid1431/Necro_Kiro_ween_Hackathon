// Omens (spec .kiro/specs/omens): limits, isolation, idempotent matches, keyword fallback labelling, cleanup.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;
const SECRET = "s".repeat(40);

const post = (guid: string, title: string, publishedAt = Date.now() - HOUR) => ({
  guid,
  title,
  link: `https://feed.test/${guid}`,
  author: null,
  publishedAt,
  contentHtml: `<p>${title}</p>`,
  excerpt: title,
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "o_alice", tokenIdentifier: "clerk|o_alice" });
  const bob = t.withIdentity({ subject: "o_bob", tokenIdentifier: "clerk|o_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const graveId = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://a.test/rss", title: "Alpha" });
  const ingest = async (items: ReturnType<typeof post>[]) => {
    await t.mutation(internal.items.ingest, { userId: aliceId, graveId, items, fetchedAt: Date.now(), firstFetch: false });
    const rows = await t.run((ctx) => ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", aliceId)).collect());
    return rows.map((r) => r._id);
  };
  return { t, alice, bob, aliceId, bobId, graveId, ingest };
}

describe("omens", () => {
  it("a new topic checks the last 7 days right away (keyword match without AI)", async () => {
    const { t, alice, ingest } = await setup();
    await ingest([post("p1", "Restrictive design and empathy"), post("p2", "Gardening in winter")]);
    await alice.mutation(api.omens.create, { topic: "design" });
    await t.finishAllScheduledFunctions(() => {});
    const m = await alice.query(api.omens.matches, {});
    expect(m.map((x) => x.title)).toEqual(["Restrictive design and empathy"]);
  });

  it("validates topics, rejects duplicates and caps at 20", async () => {
    const { alice } = await setup();
    await expect(alice.mutation(api.omens.create, { topic: "ab" })).rejects.toThrow(/3 to 60/);
    await expect(alice.mutation(api.omens.create, { topic: "of the and" })).rejects.toThrow(/meaningful/);
    await alice.mutation(api.omens.create, { topic: "Rust security" });
    await expect(alice.mutation(api.omens.create, { topic: "rust SECURITY" })).rejects.toThrow(/already/);
    for (let i = 1; i < 20; i++) await alice.mutation(api.omens.create, { topic: `topic number${i}` });
    await expect(alice.mutation(api.omens.create, { topic: "one too many" })).rejects.toThrow(/up to 20/);
  });

  it("keeps a labelled keyword match when AI is unavailable, never for strict omens, and only once", async () => {
    const { t, alice, aliceId, ingest } = await setup();
    await alice.mutation(api.omens.create, { topic: "Postgres vulnerability" });
    await alice.mutation(api.omens.create, { topic: "Postgres patched", strict: true });
    const itemIds = await ingest([post("p1", "Critical Postgres vulnerability patched"), post("p2", "Gardening in winter")]);

    // No AI chain is configured in tests, so every rung fails and the keyword fallback runs.
    const r = await t.action(internal.omensNode.check, { userId: aliceId, itemIds });
    expect(r).toEqual({ checked: 2, matched: 1 });
    const again = await t.action(internal.omensNode.check, { userId: aliceId, itemIds });
    expect(again.matched).toBe(0);

    const m = await alice.query(api.omens.matches, {});
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ topic: "Postgres vulnerability", via: "keyword", reason: "Mentions postgres, vulnerability", graveTitle: "Alpha" });
    expect(await alice.query(api.omens.unseenCount, {})).toBe(1);
    await alice.mutation(api.omens.markSeen, {});
    expect(await alice.query(api.omens.unseenCount, {})).toBe(0);
    expect((await alice.query(api.omens.list, {})).find((o) => o.topic === "Postgres vulnerability")?.matchCount).toBe(1);
  });

  it("muted omens are not checked", async () => {
    const { t, alice, aliceId, ingest } = await setup();
    const id = await alice.mutation(api.omens.create, { topic: "Postgres" });
    await alice.mutation(api.omens.update, { omenId: id, muted: true });
    const itemIds = await ingest([post("p1", "Postgres 18 released")]);
    expect(await t.action(internal.omensNode.check, { userId: aliceId, itemIds })).toEqual({ checked: 0, matched: 0 });
  });

  it("one user never sees or changes another user's omens or matches", async () => {
    const { t, alice, bob, aliceId, bobId, ingest } = await setup();
    const id = await alice.mutation(api.omens.create, { topic: "Postgres" });
    const itemIds = await ingest([post("p1", "Postgres 18 released")]);
    await t.action(internal.omensNode.check, { userId: aliceId, itemIds });
    expect(await bob.query(api.omens.list, {})).toEqual([]);
    expect(await bob.query(api.omens.matches, {})).toEqual([]);
    expect(await bob.query(api.omens.unseenCount, {})).toBe(0);
    await expect(bob.query(api.omens.matches, { omenId: id })).rejects.toThrow();
    await expect(bob.mutation(api.omens.remove, { omenId: id })).rejects.toThrow();
    // A check for Bob over Alice's items finds nothing: items are re-checked for ownership.
    const bobOmen = await bob.mutation(api.omens.create, { topic: "Postgres" });
    expect(await t.action(internal.omensNode.check, { userId: bobId, itemIds })).toEqual({ checked: 0, matched: 0 });
    // recordMatch refuses a cross-user pair.
    expect(await t.mutation(internal.omens.recordMatch, { userId: bobId, omenId: bobOmen, itemId: itemIds[0], reason: "x", via: "ai" })).toBe(false);
  });

  it("burying a feed removes its matches; deleting an omen removes it", async () => {
    const { t, alice, aliceId, graveId, ingest } = await setup();
    const id = await alice.mutation(api.omens.create, { topic: "Postgres" });
    const itemIds = await ingest([post("p1", "Postgres 18 released")]);
    await t.action(internal.omensNode.check, { userId: aliceId, itemIds });
    expect(await t.run((ctx) => ctx.db.query("omenMatches").collect())).toHaveLength(1);
    await t.mutation(internal.graves.deleteGraveData, { graveId });
    expect(await t.run((ctx) => ctx.db.query("omenMatches").collect())).toHaveLength(0);
    await alice.mutation(api.omens.remove, { omenId: id });
    expect(await alice.query(api.omens.list, {})).toEqual([]);
  });

  it("MCP get_omens returns only the caller's topics and matches", async () => {
    const { t, alice, aliceId, bobId, ingest } = await setup();
    await alice.mutation(api.omens.create, { topic: "Postgres" });
    const itemIds = await ingest([post("p1", "Postgres 18 released")]);
    await t.action(internal.omensNode.check, { userId: aliceId, itemIds });
    process.env.MCP_SERVER_SECRET = SECRET;
    const mine = await t.query(api.mcp.getOmens, { secret: SECRET, userId: aliceId, limit: 10 });
    const theirs = await t.query(api.mcp.getOmens, { secret: SECRET, userId: bobId, limit: 10 });
    delete process.env.MCP_SERVER_SECRET;
    expect(mine.omens).toHaveLength(1);
    expect(mine.matches[0]).toMatchObject({ topic: "Postgres", via: "keyword", title: "Postgres 18 released" });
    expect(theirs).toEqual({ omens: [], matches: [] });
  });
});
