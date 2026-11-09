// Grimoire (spec .kiro/specs/grimoire): compose with AI and template, invented items removed, limit, isolation.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;

const post = (guid: string, title: string, publishedAt = Date.now() - HOUR) => ({
  guid,
  title,
  link: `https://feed.test/${guid}`,
  author: null,
  publishedAt,
  contentHtml: `<p>${title}</p>`,
  excerpt: `${title} in short.`,
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "g_alice", tokenIdentifier: "clerk|g_alice" });
  const bob = t.withIdentity({ subject: "g_bob", tokenIdentifier: "clerk|g_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  await bob.mutation(api.users.store, {});
  const graveId = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://a.test/rss", title: "Alpha" });
  await t.mutation(internal.items.ingest, {
    userId: aliceId,
    graveId,
    items: [post("new1", "Faster reasoning models"), post("new2", "Rust 2.0 plans"), post("old", "Old news", Date.now() - 30 * 24 * HOUR)],
    fetchedAt: Date.now(),
    firstFetch: false,
  });
  return { t, alice, bob, aliceId };
}

afterEach(() => {
  delete process.env.AI_ALLOW_MOCK;
  delete process.env.AI_CHAIN_GRIMOIRE;
});

describe("grimoire", () => {
  it("writes a template from this week's items when no AI answers, and keeps it in history", async () => {
    const { alice } = await setup();
    const r = await alice.action(api.grimoireNode.compose, {});
    expect(r.ghost).toBe(true);
    const g = await alice.query(api.grimoires.get, { grimoireId: r.grimoireId });
    expect(g.markdown).toContain("## [Faster reasoning models](https://feed.test/new1)");
    expect(g.markdown).toContain("*Alpha*");
    expect(g.markdown).not.toContain("Old news");
    expect(await alice.query(api.grimoires.list, {})).toHaveLength(1);
  });

  it("with AI: removes sections about items that were never picked", async () => {
    process.env.AI_ALLOW_MOCK = "true";
    process.env.AI_CHAIN_GRIMOIRE = "mock:grimoire";
    const { alice } = await setup();
    const r = await alice.action(api.grimoireNode.compose, {});
    expect(r.ghost).toBe(false);
    const g = await alice.query(api.grimoires.get, { grimoireId: r.grimoireId });
    expect(g.title).toBe("The week in reasoning models");
    expect(g.markdown).toContain("Alpha reports a faster model");
    expect(g.markdown).not.toContain("never picked");
    expect(g.markdown.match(/^## /gm)).toHaveLength(1);
  });

  it("lets the owner edit and delete, and nobody else", async () => {
    const { alice, bob } = await setup();
    const { grimoireId } = await alice.action(api.grimoireNode.compose, {});
    await alice.mutation(api.grimoires.update, { grimoireId, markdown: "# My edit\n\nHello" });
    expect((await alice.query(api.grimoires.get, { grimoireId })).title).toBe("My edit");
    await expect(bob.query(api.grimoires.get, { grimoireId })).rejects.toThrow();
    await expect(bob.mutation(api.grimoires.update, { grimoireId, markdown: "# Hijack" })).rejects.toThrow();
    await expect(bob.mutation(api.grimoires.remove, { grimoireId })).rejects.toThrow();
    expect(await bob.query(api.grimoires.list, {})).toEqual([]);
    await alice.mutation(api.grimoires.remove, { grimoireId });
    expect(await alice.query(api.grimoires.list, {})).toEqual([]);
  });

  it("refuses when nothing rose this week, and after 10 drafts in a day", async () => {
    const { t, alice, bob, aliceId } = await setup();
    await expect(bob.action(api.grimoireNode.compose, {})).rejects.toThrow(/Nothing rose/);
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) await ctx.db.insert("aiUsage", { userId: aliceId, task: "grimoire", model: "x", inputTokens: 0, outputTokens: 0, day });
    });
    await expect(alice.action(api.grimoireNode.compose, {})).rejects.toThrow(/10 of today's Grimoire drafts/);
  });
});
