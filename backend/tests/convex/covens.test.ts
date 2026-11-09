// Covens (spec .kiro/specs/covens): ownership, visibility, privacy, follows, reports, limits, deletion.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "u_alice", tokenIdentifier: "clerk|u_alice", name: "Alice Private", email: "alice@secret.test" });
  const bob = t.withIdentity({ subject: "u_bob", tokenIdentifier: "clerk|u_bob" });
  const carol = t.withIdentity({ subject: "u_carol", tokenIdentifier: "clerk|u_carol" });
  const dave = t.withIdentity({ subject: "u_dave", tokenIdentifier: "clerk|u_dave" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  await carol.mutation(api.users.store, {});
  await dave.mutation(api.users.store, {});
  const g1 = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://a.test/rss", title: "Alpha" });
  const g2 = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://b.test/rss", title: "Beta" });
  const bobGrave = await t.mutation(internal.graves.create, { userId: bobId, feedUrl: "https://bob.test/rss", title: "Bob only" });
  return { t, alice, bob, carol, dave, aliceId, bobId, g1, g2, bobGrave };
}

const base = { description: "Good feeds", topic: "security" as const };

describe("publishing", () => {
  it("stores a snapshot of the curator's own feeds and shows it in Discover", async () => {
    const { alice, bob, g1, g2 } = await setup();
    const { slug } = await alice.mutation(api.covens.create, { ...base, title: "Security daily", visibility: "public", graveIds: [g1, g2] });
    const found = await bob.query(api.covens.discover, {});
    expect(found.map((c) => c.slug)).toEqual([slug]);
    expect(found[0]).toMatchObject({ feedCount: 2, curator: "A Necro reader", preview: ["Alpha", "Beta"] });
  });

  it("refuses feeds that belong to someone else", async () => {
    const { alice, bobGrave, g1 } = await setup();
    await expect(alice.mutation(api.covens.create, { ...base, title: "Sneaky", visibility: "public", graveIds: [g1, bobGrave] })).rejects.toThrow(/could not be found/);
  });

  it("keeps unlisted collections out of Discover but reachable by link", async () => {
    const { alice, bob, g1 } = await setup();
    const { slug } = await alice.mutation(api.covens.create, { ...base, title: "Class reading", visibility: "unlisted", graveIds: [g1] });
    expect(await bob.query(api.covens.discover, {})).toEqual([]);
    expect((await bob.query(api.covens.get, { slug }))?.title).toBe("Class reading");
  });

  it("never exposes the curator's email, Clerk name or private rows", async () => {
    const { t, alice, bob, aliceId, g1 } = await setup();
    await t.mutation(internal.items.ingest, {
      userId: aliceId, graveId: g1, fetchedAt: Date.now(), firstFetch: false,
      items: [{ guid: "1", title: "Private read", link: null, author: null, publishedAt: Date.now(), contentHtml: "<p>x</p>", excerpt: "x" }],
    });
    const { slug } = await alice.mutation(api.covens.create, { ...base, title: "Public list", visibility: "public", graveIds: [g1] });
    const everything = JSON.stringify([await bob.query(api.covens.discover, {}), await bob.query(api.covens.get, { slug }), await bob.query(api.covens.trendingFeeds, {})]);
    expect(everything).not.toMatch(/alice@secret\.test|Alice Private|Private read|isRead|isStarred/);
  });

  it("uses the public display name when set, and rejects emails as names", async () => {
    const { alice, bob, g1 } = await setup();
    await alice.mutation(api.users.setDisplayName, { displayName: "Dr. Feeds" });
    await expect(alice.mutation(api.users.setDisplayName, { displayName: "me@x.test" })).rejects.toThrow(/not an email/);
    await alice.mutation(api.covens.create, { ...base, title: "Named list", visibility: "public", graveIds: [g1] });
    expect((await bob.query(api.covens.discover, {}))[0].curator).toBe("Dr. Feeds");
  });

  it("enforces title length and the 10-collection limit", async () => {
    const { alice, g1 } = await setup();
    await expect(alice.mutation(api.covens.create, { ...base, title: "x", visibility: "public", graveIds: [g1] })).rejects.toThrow(/Title/);
    for (let i = 0; i < 10; i++) await alice.mutation(api.covens.create, { ...base, title: `List ${i}`, visibility: "unlisted", graveIds: [g1] });
    await expect(alice.mutation(api.covens.create, { ...base, title: "One more", visibility: "unlisted", graveIds: [g1] })).rejects.toThrow(/up to 10/);
  });

  it("only lets the owner edit or delete", async () => {
    const { alice, bob, g1 } = await setup();
    const { collectionId } = await alice.mutation(api.covens.create, { ...base, title: "Mine", visibility: "public", graveIds: [g1] });
    await expect(bob.mutation(api.covens.update, { collectionId, title: "Hijacked" })).rejects.toThrow(/could not be found/);
    await expect(bob.mutation(api.covens.remove, { collectionId })).rejects.toThrow(/could not be found/);
  });
});

describe("following, subscribing and reporting", () => {
  it("counts a follow once, shows missing feeds and lets the follower unfollow", async () => {
    const { t, alice, bob, bobId, g1, g2 } = await setup();
    const { collectionId, slug } = await alice.mutation(api.covens.create, { ...base, title: "Duo", visibility: "public", graveIds: [g1, g2] });
    await bob.mutation(api.covens.follow, { collectionId });
    await bob.mutation(api.covens.follow, { collectionId });
    expect((await bob.query(api.covens.get, { slug }))).toMatchObject({ followerCount: 1, following: true, alreadyHave: [] });
    await t.mutation(internal.graves.create, { userId: bobId, feedUrl: "https://a.test/rss", title: "Alpha" });
    expect((await bob.query(api.covens.following, {}))[0].missing).toBe(1);
    await bob.mutation(api.covens.unfollow, { collectionId });
    expect((await bob.query(api.covens.get, { slug }))?.followerCount).toBe(0);
    await expect(alice.mutation(api.covens.follow, { collectionId })).rejects.toThrow(/own collection/);
  });

  it("subscribing adds only feeds you don't have, via the same path as OPML import", async () => {
    const { t, alice, bobId, g1, g2 } = await setup();
    const { collectionId } = await alice.mutation(api.covens.create, { ...base, title: "Duo", visibility: "public", graveIds: [g1, g2] });
    await t.mutation(internal.graves.create, { userId: bobId, feedUrl: "https://a.test/rss", title: "Alpha" });
    const feeds = [{ title: "Alpha", feedUrl: "https://a.test/rss" }, { title: "Beta", feedUrl: "https://b.test/rss" }];
    expect(await t.mutation(internal.graves.createMany, { userId: bobId, feeds })).toEqual({ created: 1, duplicates: 1, skipped: 0 });
    await t.mutation(internal.covens.recordSubscribe, { userId: bobId, collectionId });
    const c = await t.query(internal.covens.forSubscribe, { slug: (await t.run((ctx) => ctx.db.get(collectionId)))!.slug });
    expect(c?.feeds).toHaveLength(2);
  });

  it("hides a collection from Discover after reports from 3 different users", async () => {
    const { alice, bob, carol, dave, g1 } = await setup();
    const { collectionId, slug } = await alice.mutation(api.covens.create, { ...base, title: "Spammy", visibility: "public", graveIds: [g1] });
    await bob.mutation(api.covens.report, { collectionId, reason: "spam" });
    expect(await bob.mutation(api.covens.report, { collectionId, reason: "spam" })).toEqual({ alreadyReported: true });
    await carol.mutation(api.covens.report, { collectionId, reason: "spam" });
    expect((await bob.query(api.covens.discover, {})).length).toBe(1);
    await dave.mutation(api.covens.report, { collectionId, reason: "spam" });
    expect(await bob.query(api.covens.discover, {})).toEqual([]);
    expect(await bob.query(api.covens.get, { slug })).toBeNull();
    expect((await alice.query(api.covens.get, { slug }))?.hidden).toBe(true); // owner still sees it
  });

  it("deleting an account removes its collections and follows", async () => {
    const { t, alice, bob, aliceId, bobId, g1 } = await setup();
    const { collectionId } = await alice.mutation(api.covens.create, { ...base, title: "Gone soon", visibility: "public", graveIds: [g1] });
    await bob.mutation(api.covens.follow, { collectionId });
    await t.mutation(internal.users.deleteBatch, { userId: aliceId });
    await t.finishAllScheduledFunctions(() => {});
    expect(await bob.query(api.covens.discover, {})).toEqual([]);
    const follows = await t.run((ctx) => ctx.db.query("collectionFollows").withIndex("by_user", (q) => q.eq("userId", bobId as Id<"users">)).collect());
    expect(follows).toEqual([]);
  });
});
