// Kindred (spec .kiro/specs/kindred): cross-feed grouping, same-feed never grouped, per user, idempotent.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { stableId } from "../../convex/kindred";

const modules = import.meta.glob("../../convex/**/*.*s");
const HOUR = 3_600_000;

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
  const alice = t.withIdentity({ subject: "k_alice", tokenIdentifier: "clerk|k_alice" });
  const bob = t.withIdentity({ subject: "k_bob", tokenIdentifier: "clerk|k_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const grave = (userId: Id<"users">, n: string) => t.mutation(internal.graves.create, { userId, feedUrl: `https://${n}.test/rss`, title: n });
  const ingest = (userId: Id<"users">, graveId: Id<"graves">, items: ReturnType<typeof post>[]) =>
    t.mutation(internal.items.ingest, { userId, graveId, items, fetchedAt: Date.now(), firstFetch: false });
  return { t, alice, bob, aliceId, bobId, grave, ingest };
}

async function itemsOf(t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) {
  return await t.run((ctx) => ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", userId)).collect());
}

const launch = "OpenAI releases new reasoning model with faster tool calling";
const launch2 = "OpenAI releases new reasoning model, promises faster tool calling";

describe("kindred", () => {
  it("groups the same story from two feeds and shows it in the reading pane and over MCP", async () => {
    const { t, alice, aliceId, grave, ingest } = await setup();
    const a = await grave(aliceId, "alpha");
    const b = await grave(aliceId, "beta");
    await ingest(aliceId, a, [post("a1", launch), post("a2", "Gardening tips for the winter months")]);
    await ingest(aliceId, b, [post("b1", launch2)]);
    const r = await t.mutation(internal.kindred.cluster, { userId: aliceId });
    expect(r.groups).toBe(1);

    const items = await itemsOf(t, aliceId);
    const grouped = items.filter((i) => i.kindredId);
    expect(grouped.map((i) => i.guid).sort()).toEqual(["a1", "b1"]);
    expect(new Set(grouped.map((i) => i.kindredId)).size).toBe(1);

    const a1 = items.find((i) => i.guid === "a1")!;
    const view = await alice.query(api.items.get, { itemId: a1._id });
    expect(view.kindred).toHaveLength(1);
    expect(view.kindred[0]).toMatchObject({ graveTitle: "beta", title: launch2 });

    const card = await alice.query(api.items.list, { filter: "all", paginationOpts: { numItems: 10, cursor: null } });
    expect(card.page.find((i) => i._id === a1._id)?.kindred).toBe(true);

    const secret = "s".repeat(40);
    process.env.MCP_SERVER_SECRET = secret;
    const groups = await t.query(api.mcp.listKindred, { secret, userId: aliceId, limit: 10 });
    expect(groups).toHaveLength(1);
    expect(groups[0].feeds.sort()).toEqual(["alpha", "beta"]);
    delete process.env.MCP_SERVER_SECRET;
  });

  it("never groups two items from the same feed", async () => {
    const { t, aliceId, grave, ingest } = await setup();
    const a = await grave(aliceId, "alpha");
    await ingest(aliceId, a, [post("a1", launch), post("a2", launch2)]);
    await t.mutation(internal.kindred.cluster, { userId: aliceId });
    expect((await itemsOf(t, aliceId)).every((i) => !i.kindredId)).toBe(true);
  });

  it("never joins one user's items with another user's", async () => {
    const { t, aliceId, bobId, grave, ingest } = await setup();
    await ingest(aliceId, await grave(aliceId, "alpha"), [post("a1", launch)]);
    await ingest(bobId, await grave(bobId, "beta"), [post("b1", launch2)]);
    await t.mutation(internal.kindred.cluster, { userId: aliceId });
    await t.mutation(internal.kindred.cluster, { userId: bobId });
    expect((await itemsOf(t, aliceId)).every((i) => !i.kindredId)).toBe(true);
    expect((await itemsOf(t, bobId)).every((i) => !i.kindredId)).toBe(true);
  });

  it("is idempotent and keeps the group id when a third feed joins", async () => {
    const { t, aliceId, grave, ingest } = await setup();
    const a = await grave(aliceId, "alpha");
    const b = await grave(aliceId, "beta");
    const c = await grave(aliceId, "gamma");
    await ingest(aliceId, a, [post("a1", launch, Date.now() - 3 * HOUR)]);
    await ingest(aliceId, b, [post("b1", launch2, Date.now() - 2 * HOUR)]);
    await t.mutation(internal.kindred.cluster, { userId: aliceId });
    const first = (await itemsOf(t, aliceId)).find((i) => i.guid === "a1")!.kindredId;
    expect(first).toBeTruthy();

    const again = await t.mutation(internal.kindred.cluster, { userId: aliceId });
    expect(again.changed).toBe(0);

    await ingest(aliceId, c, [post("c1", "OpenAI releases new reasoning model with faster tool calling today")]);
    await t.mutation(internal.kindred.cluster, { userId: aliceId });
    const ids = new Set((await itemsOf(t, aliceId)).map((i) => i.kindredId));
    expect([...ids]).toEqual([first]);
  });

  it("ignores items older than 48 hours", async () => {
    const { t, aliceId, grave, ingest } = await setup();
    await ingest(aliceId, await grave(aliceId, "alpha"), [post("a1", launch, Date.now() - 72 * HOUR)]);
    await ingest(aliceId, await grave(aliceId, "beta"), [post("b1", launch2)]);
    await t.mutation(internal.kindred.cluster, { userId: aliceId });
    expect((await itemsOf(t, aliceId)).every((i) => !i.kindredId)).toBe(true);
  });

  it("removes index rows when a feed is buried", async () => {
    const { t, aliceId, grave, ingest } = await setup();
    const a = await grave(aliceId, "alpha");
    await ingest(aliceId, a, [post("a1", launch)]);
    expect(await t.run((ctx) => ctx.db.query("kindredIndex").collect())).toHaveLength(1);
    await t.mutation(internal.graves.deleteGraveData, { graveId: a });
    expect(await t.run((ctx) => ctx.db.query("kindredIndex").collect())).toHaveLength(0);
  });

  it("picks the smallest existing id when groups merge, else the oldest item", () => {
    const m = (itemId: string, publishedAt: number, kindredId?: string) => ({ itemId: itemId as Id<"items">, publishedAt, kindredId });
    expect(stableId([m("x", 2), m("y", 1)])).toBe("y");
    expect(stableId([m("x", 2, "k2"), m("y", 1, "k1"), m("z", 0)])).toBe("k1");
  });
});
