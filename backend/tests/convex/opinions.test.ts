// Second Opinion (spec .kiro/specs/second-opinion): citation filter, cache, fallback, isolation, limit.
// Also covers the AI-confirmed Omen path through the same mock provider.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;
const launch = "Acme launches new reasoning model with faster tool calling";
const launch2 = "Acme launches new reasoning model, promising faster tool calling";

const post = (guid: string, title: string) => ({
  guid,
  title,
  link: `https://feed.test/${guid}`,
  author: null,
  publishedAt: Date.now() - HOUR,
  contentHtml: `<p>${title}. The company said the model is cheaper to run and ships to developers this week, with more details in a blog post.</p>`,
  excerpt: title,
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "op_alice", tokenIdentifier: "clerk|op_alice" });
  const bob = t.withIdentity({ subject: "op_bob", tokenIdentifier: "clerk|op_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const grave = (userId: Id<"users">, n: string) => t.mutation(internal.graves.create, { userId, feedUrl: `https://${n}.test/rss`, title: n });
  const ingest = (userId: Id<"users">, graveId: Id<"graves">, items: ReturnType<typeof post>[]) =>
    t.mutation(internal.items.ingest, { userId, graveId, items, fetchedAt: Date.now(), firstFetch: false });
  const a = await grave(aliceId, "alpha");
  const b = await grave(aliceId, "beta");
  await ingest(aliceId, a, [post("a1", launch)]);
  await ingest(aliceId, b, [post("b1", launch2)]);
  await t.mutation(internal.kindred.cluster, { userId: aliceId });
  const items = await t.run((ctx) => ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", aliceId)).collect());
  const a1 = items.find((i) => i.guid === "a1")!._id;
  return { t, alice, bob, aliceId, bobId, grave, ingest, a1 };
}

const usage = (t: Awaited<ReturnType<typeof setup>>["t"]) => t.run((ctx) => ctx.db.query("aiUsage").collect());

describe("second opinion without AI", () => {
  it("falls back to sources side by side, caches it, and uses no quota", async () => {
    const { t, alice, a1 } = await setup();
    const o = await alice.action(api.opinionNode.compare, { itemId: a1 });
    expect(o.ghost).toBe(true);
    expect(o.sources.map((s) => [s.label, s.feed])).toEqual([["S1", "alpha"], ["S2", "beta"]]);
    expect(o.sources[0].key.length).toBeGreaterThan(0);
    expect(o.agree).toEqual([]);
    expect(await alice.query(api.opinions.forItem, { itemId: a1 })).toMatchObject({ ghost: true });
    expect(await usage(t)).toHaveLength(0);
  });

  it("refuses an item with no other sources, and another user's item", async () => {
    const { t, alice, bob, aliceId, grave, ingest, a1 } = await setup();
    const g = await grave(aliceId, "gamma");
    await ingest(aliceId, g, [post("g1", "Gardening tips for winter")]);
    const g1 = (await t.run((ctx) => ctx.db.query("items").collect())).find((i) => i.guid === "g1")!._id;
    await expect(alice.action(api.opinionNode.compare, { itemId: g1 })).rejects.toThrow(/no other sources/);
    await expect(bob.action(api.opinionNode.compare, { itemId: a1 })).rejects.toThrow();
    await expect(bob.query(api.opinions.forItem, { itemId: a1 })).rejects.toThrow();
  });
});

describe("with the mock AI provider", () => {
  beforeEach(() => {
    process.env.AI_ALLOW_MOCK = "true";
    process.env.AI_CHAIN_OPINION = "mock:opinion";
    process.env.AI_CHAIN_OMEN = "mock:omen";
  });
  afterEach(() => {
    delete process.env.AI_ALLOW_MOCK;
    delete process.env.AI_CHAIN_OPINION;
    delete process.env.AI_CHAIN_OMEN;
  });

  it("drops citations outside the group, caches the result and charges one use", async () => {
    const { t, alice, a1 } = await setup();
    const o = await alice.action(api.opinionNode.compare, { itemId: a1 });
    expect(o.ghost).toBe(false);
    expect(o.agree).toEqual([{ point: "Both report the same launch date.", sources: ["S1", "S2"] }]);
    expect(o.differ[0].views.map((v) => v.source)).toEqual(["S1", "S2"]);
    expect(o.onlyOne).toEqual([{ claim: "A second model ships next month.", source: "S2" }]);
    await alice.action(api.opinionNode.compare, { itemId: a1 }); // cached
    expect((await usage(t)).filter((u) => u.task === "opinion")).toHaveLength(1);
  });

  it("upgrades a Ghost comparison on retry", async () => {
    const { alice, a1 } = await setup();
    delete process.env.AI_CHAIN_OPINION;
    process.env.AI_CHAIN_SEANCE = "";
    expect((await alice.action(api.opinionNode.compare, { itemId: a1 })).ghost).toBe(true);
    process.env.AI_CHAIN_OPINION = "mock:opinion";
    expect((await alice.action(api.opinionNode.compare, { itemId: a1, retry: true })).ghost).toBe(false);
    delete process.env.AI_CHAIN_SEANCE;
  });

  it("falls back to side by side when today's limit is used up", async () => {
    const { t, alice, aliceId, a1 } = await setup();
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) await ctx.db.insert("aiUsage", { userId: aliceId, task: "opinion", model: "x", inputTokens: 0, outputTokens: 0, day });
    });
    expect((await alice.action(api.opinionNode.compare, { itemId: a1 })).ghost).toBe(true);
  });

  it("records an AI-confirmed Omen match", async () => {
    const { t, alice, aliceId } = await setup();
    await alice.mutation(api.omens.create, { topic: "reasoning model" }); // checks recent posts right away
    await t.finishAllScheduledFunctions(() => {});
    const itemIds = (await t.run((ctx) => ctx.db.query("items").collect())).map((i) => i._id);
    expect(await t.action(internal.omensNode.check, { userId: aliceId, itemIds })).toEqual({ checked: 0, matched: 0 }); // nothing left: each match is recorded once
    const m = await alice.query(api.omens.matches, {});
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.via === "ai" && x.reason === "The article is about the watched topic.")).toBe(true);
  });
});
