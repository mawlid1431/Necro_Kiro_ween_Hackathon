// The product goal as one backend flow (spec .kiro/specs/privacy-trust, req 5):
// sign up, add three feeds, read an article, hold a Séance, Resurrect it, connect an MCP client.
// Then Private mode, export, and account deletion that leaves nothing behind.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id, TableNames } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;
const SECRET = "s".repeat(40);

const post = (guid: string, title: string) => ({
  guid,
  title,
  link: `https://feed.test/${guid}`,
  author: null,
  publishedAt: Date.now() - HOUR,
  contentHtml: `<p>${title}. A longer paragraph explains what happened and why it matters to developers who read it this week.</p>`,
  excerpt: title,
});

beforeEach(() => {
  process.env.AI_ALLOW_MOCK = "true";
  process.env.AI_CHAIN_SEANCE = "mock:seance";
  process.env.AI_CHAIN_RESURRECT = "mock:resurrect";
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterEach(() => {
  for (const k of ["AI_ALLOW_MOCK", "AI_CHAIN_SEANCE", "AI_CHAIN_RESURRECT", "MCP_SERVER_SECRET"]) delete process.env[k];
  vi.useRealTimers();
});

async function signUpWithThreeFeeds() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "goal_alice", tokenIdentifier: "clerk|goal_alice", email: "alice@goal.test" });
  const userId = await alice.mutation(api.users.store, {});
  const created = await t.mutation(internal.graves.createMany, {
    userId,
    feeds: [
      { feedUrl: "https://one.test/rss", title: "One" },
      { feedUrl: "https://two.test/rss", title: "Two" },
      { feedUrl: "https://three.test/rss", title: "Three" },
    ],
  });
  const graves = await alice.query(api.graves.list, {});
  for (const [n, g] of graves.entries()) {
    await t.mutation(internal.items.ingest, { userId, graveId: g._id, items: [post(`p${n}`, `Story number ${n}`)], fetchedAt: Date.now(), firstFetch: true });
  }
  return { t, alice, userId, created, graves };
}

describe("goal flow", () => {
  it("sign up → three feeds → read → Séance → Resurrect → MCP", async () => {
    const { t, alice, userId, graves } = await signUpWithThreeFeeds();
    expect(graves).toHaveLength(3);

    const page = await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page).toHaveLength(3);
    const itemId = page.page[0]._id;
    const article = await alice.query(api.items.get, { itemId });
    expect(article.contentHtml).toContain("Story number");
    await alice.mutation(api.items.setRead, { itemId, value: true });

    const seance = await alice.action(api.aiNode.holdSeance, { itemId });
    expect(seance).toMatchObject({ ghost: false, score: 72 });
    expect(seance.summary).toHaveLength(3);

    const drafts = await alice.action(api.aiNode.raiseResurrect, { itemId });
    expect(drafts.map((d) => d.platform).sort()).toEqual(["instagram", "linkedin", "x"]);

    const key = await alice.action(api.apiKeys.create, { name: "Kiro" });
    const hash = await t.run(async (ctx) => (await ctx.db.query("apiKeys").first())!.hash);
    const auth = await t.mutation(api.mcp.authenticate, { hash, secret: SECRET });
    expect(auth).toMatchObject({ ok: true, userId });
    expect(key).toBeTruthy();
    const graveList = await t.query(api.mcp.listGraves, { secret: SECRET, userId });
    expect(graveList).toHaveLength(3);
  });

  it("Private mode: no training provider is used, and Ghost mode answers when none is left", async () => {
    const { alice, graves } = await signUpWithThreeFeeds();
    process.env.AI_CHAIN_SEANCE = "openrouter:openrouter/free"; // a provider that may train on prompts
    process.env.OPENROUTER_API_KEY = "test";
    await alice.mutation(api.users.setPrivateMode, { value: true });
    expect((await alice.query(api.users.me, {}))?.privateMode).toBe(true);
    const items = await alice.query(api.items.list, { graveId: graves[0]._id, filter: "all", paginationOpts: { numItems: 1, cursor: null } });
    const s = await alice.action(api.aiNode.holdSeance, { itemId: items.page[0]._id });
    expect(s.ghost).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
  });

  it("export contains the user's own data and no article bodies", async () => {
    const { alice } = await signUpWithThreeFeeds();
    await alice.mutation(api.omens.create, { topic: "Story number" });
    const data = await alice.query(api.graves.exportData, {});
    expect(data.feeds.map((f) => f.title).sort()).toEqual(["One", "Three", "Two"]);
    expect(data.opml).toContain('xmlUrl="https://one.test/rss"');
    expect(data.omens).toEqual([{ topic: "Story number", strict: false, muted: false, matchCount: 0 }]);
    expect(JSON.stringify(data)).not.toContain("A longer paragraph");
  });

  it("deleting the account removes every row the user owns, in every table", async () => {
    vi.useFakeTimers();
    const { t, alice, userId, graves } = await signUpWithThreeFeeds();
    const items = await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 3, cursor: null } });
    const itemId = items.page[0]._id;
    await alice.action(api.aiNode.holdSeance, { itemId });
    await alice.action(api.aiNode.raiseResurrect, { itemId });
    await alice.action(api.apiKeys.create, { name: "Kiro" });
    await alice.mutation(api.omens.create, { topic: "Story number" });
    await t.action(internal.omensNode.check, { userId, itemIds: items.page.map((i) => i._id) });
    await alice.mutation(api.covens.create, { title: "My feeds", description: "", topic: "dev", visibility: "public", graveIds: [graves[0]._id] });
    await alice.action(api.grimoireNode.compose, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("briefings", { userId, day: "2026-11-09", headline: "h", body: "b", picks: [], model: "ghost" });
      await ctx.db.insert("voice", { userId, tone: "calm", audience: "devs", wordsToUse: [], wordsToAvoid: [], samplePosts: [] });
    });

    await expect(alice.action(api.users.deleteAllData, { confirm: "DELETE" })).resolves.toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const owned: TableNames[] = [
      "graves", "items", "kindredIndex", "omens", "omenMatches", "opinions", "grimoires", "seances", "drafts", "voice",
      "apiKeys", "aiUsage", "voiceSessions", "briefings", "collections", "collectionFollows", "collectionReports",
    ];
    const left = await t.run(async (ctx) => {
      const out: Record<string, number> = {};
      for (const table of owned) {
        const rows = (await ctx.db.query(table).collect()) as { userId?: Id<"users"> }[];
        const mine = rows.filter((r) => r.userId === userId).length;
        if (mine) out[table] = mine;
      }
      return out;
    });
    expect(left).toEqual({});
    expect(await t.run((ctx) => ctx.db.get(userId))).toBeNull();
  });
});
