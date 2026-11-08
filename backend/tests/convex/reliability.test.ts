// Reliability state in Convex: breakers, provider budgets, and Ghost Séances being upgraded on retry.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");

describe("provider health", () => {
  it("a 429 opens the breaker; success closes it", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.providerHealth.isOpen, { provider: "groq" })).toBe(false);
    await t.mutation(internal.providerHealth.recordResult, { provider: "groq", ok: false, status: 429 });
    expect(await t.query(internal.providerHealth.isOpen, { provider: "groq" })).toBe(true);
    expect(await t.query(internal.providerHealth.isOpen, { provider: "google" })).toBe(false); // per provider
    await t.mutation(internal.providerHealth.recordResult, { provider: "groq", ok: true });
    expect(await t.query(internal.providerHealth.isOpen, { provider: "groq" })).toBe(false);
  });

  it("budgets stop a provider at its per-minute limit", async () => {
    const t = convexTest(schema, modules);
    process.env.AI_BUDGET_MOCK = "3,100";
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await t.mutation(internal.providerHealth.reserveBudget, { provider: "mock" }));
    expect(results).toEqual([true, true, true, false, false]);
    delete process.env.AI_BUDGET_MOCK;
  });
});

describe("Ghost Séance", () => {
  it("is replaced by a model Séance on retry, but a model Séance is never overwritten", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "u_a", tokenIdentifier: "clerk|u_a" });
    const userId = await alice.mutation(api.users.store, {});
    const graveId = await t.mutation(internal.graves.create, { userId, feedUrl: "https://f.test/rss", title: "F" });
    await t.mutation(internal.items.ingest, {
      userId, graveId, fetchedAt: Date.now(), firstFetch: false,
      items: [{ guid: "1", title: "T", link: null, author: null, publishedAt: Date.now(), contentHtml: "<p>x</p>", excerpt: "x" }],
    });
    const [{ _id: itemId }] = (await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 1, cursor: null } })).page;
    const base = { userId, itemId, reason: "r", inputTokens: 0, outputTokens: 0 };

    const g = await t.mutation(internal.seances.save, { ...base, summary: ["a", "b", "c"], score: 50, model: "ghost:extractive" });
    expect(g.ghost).toBe(true);
    expect((await alice.query(api.items.get, { itemId })).seance?.ghost).toBe(true);

    const m = await t.mutation(internal.seances.save, { ...base, summary: ["d", "e", "f"], score: 80, model: "groq:x" });
    expect(m).toMatchObject({ ghost: false, score: 80 });

    const again = await t.mutation(internal.seances.save, { ...base, summary: ["g", "h", "i"], score: 10, model: "groq:y" });
    expect(again.model).toBe("groq:x"); // idempotent: the first model Séance stays
    expect((await alice.query(api.items.get, { itemId })).score).toBe(80);
  });
});
