// The Circle: opt-in profiles, follows, the Following stream, posts in your topics and clean account deletion.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { publicFeedUrl } from "../../convex/circle";

const modules = import.meta.glob("../../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const as = (name: string) => t.withIdentity({ subject: `h_${name}`, tokenIdentifier: `clerk|h_${name}` });
  const alice = as("alice");
  const bob = as("bob");
  const carol = as("carol");
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  await carol.mutation(api.users.store, {});
  return { t, alice, bob, carol, aliceId, bobId };
}

/** Alice publishes one article post to X through Necro: a "posting" publish that finishes as "posted". */
async function alicePosts(t: Awaited<ReturnType<typeof setup>>["t"], aliceId: Id<"users">, feedUrl = "https://blog.example/feed.xml") {
  const publishId = await t.run(async (ctx) => {
    const now = Date.now();
    const graveId = await ctx.db.insert("graves", { userId: aliceId, feedUrl, title: "Example Blog", status: "alive", nextFetchAt: now, failureCount: 0, unreadCount: 0 });
    const itemId = await ctx.db.insert("items", {
      userId: aliceId, graveId, guid: "g1", title: "OpenAI ships a new reasoning model", link: "https://blog.example/a",
      publishedAt: now, contentHtml: "", excerpt: "", isRead: true, isStarred: false, risenAt: now, topic: "ai", imageUrl: "https://cdn.example/a.jpg",
    });
    const draftId = await ctx.db.insert("drafts", { userId: aliceId, itemId, platform: "x", text: "Worth a read on reasoning models.", hashtags: [], status: "draft", model: "t" });
    return await ctx.db.insert("publishes", { userId: aliceId, itemId, draftId, platform: "x", kind: "article", status: "posting", createdAt: now, at: now });
  });
  await t.mutation(internal.social.finishPublish, { publishId, status: "posted", url: "https://x.com/alice/status/1" });
  return publishId;
}

describe("circle", () => {
  it("a profile stays private until its owner turns it on, and needs a display name", async () => {
    const { alice, bob } = await setup();
    await expect(alice.mutation(api.circle.setProfile, { public: true })).rejects.toThrow(/display name/);
    await alice.mutation(api.users.setDisplayName, { displayName: "Alice Reader" });
    const { slug } = await alice.mutation(api.circle.setProfile, { public: true, bio: "I read about AI." });
    expect(slug).toMatch(/^alice-reader-[a-z0-9]{4}$/);
    expect(await bob.query(api.circle.profile, { slug: slug! })).toMatchObject({ name: "Alice Reader", bio: "I read about AI.", isPublic: true, isMe: false });

    await alice.mutation(api.circle.setProfile, { public: false });
    expect(await bob.query(api.circle.profile, { slug: slug! })).toBeNull(); // hidden at once
    expect(await alice.query(api.circle.profile, { slug: slug! })).toMatchObject({ isMe: true, isPublic: false }); // owner can preview
    await expect(bob.mutation(api.circle.follow, { slug: slug! })).rejects.toThrow(/private/);
  });

  it("records a published post exactly once and shows it to followers, live and newest first", async () => {
    const { t, alice, bob, carol, aliceId } = await setup();
    await alice.mutation(api.users.setDisplayName, { displayName: "Alice" });
    const { slug } = await alice.mutation(api.circle.setProfile, { public: true });

    await expect(alice.mutation(api.circle.follow, { slug: slug! })).rejects.toThrow(/yourself/);
    await bob.mutation(api.circle.follow, { slug: slug! });
    await bob.mutation(api.circle.follow, { slug: slug! }); // twice is still one follow
    expect(await alice.query(api.circle.me, {})).toMatchObject({ followerCount: 1, sharedCount: 0 });
    expect((await bob.query(api.circle.following, {})).posts).toEqual([]);

    const publishId = await alicePosts(t, aliceId);
    // A retried finish must not record it twice.
    await t.mutation(internal.social.finishPublish, { publishId, status: "posted", url: "https://x.com/alice/status/1" });

    const feed = await bob.query(api.circle.following, {});
    expect(feed.posts).toHaveLength(1);
    expect(feed.posts[0]).toMatchObject({
      platform: "x", text: "Worth a read on reasoning models.", url: "https://x.com/alice/status/1",
      itemTitle: "OpenAI ships a new reasoning model", feedUrl: "https://blog.example/feed.xml", topic: "ai",
      imageUrl: "https://cdn.example/a.jpg", author: { slug, name: "Alice" }, isFollowing: true,
    });
    expect(await alice.query(api.circle.me, {})).toMatchObject({ sharedCount: 1 });

    // Carol does not follow Alice but reads about AI: the post shows in her topics, not in her Following.
    await carol.mutation(api.users.setInterests, { interests: ["AI agents"] });
    expect((await carol.query(api.circle.following, {})).posts).toEqual([]);
    const mine = await carol.query(api.circle.inMyTopics, {});
    expect(mine.topics).toContain("ai");
    expect(mine.posts.map((p) => p.author.slug)).toEqual([slug]);
    const people = await carol.query(api.circle.people, {});
    expect(people[0]).toMatchObject({ slug, sharedTopics: ["ai"], isFollowing: false, postCount: 1 });
    // Bob already follows Alice, so her post is in his Following, not repeated in his topics.
    await bob.mutation(api.users.setInterests, { interests: ["AI"] });
    expect((await bob.query(api.circle.inMyTopics, {})).posts).toEqual([]);

    // Alice goes private: the post disappears from Bob's stream and Carol's topics at once.
    await alice.mutation(api.circle.setProfile, { public: false });
    expect((await bob.query(api.circle.following, {})).posts).toEqual([]);
    expect((await carol.query(api.circle.inMyTopics, {})).posts).toEqual([]);

    await bob.mutation(api.circle.unfollow, { slug: slug! });
    expect(await alice.query(api.circle.me, {})).toMatchObject({ followerCount: 0 });
    expect(await bob.query(api.circle.me, {})).toMatchObject({ followingCount: 0 });
  });

  it("never shares a failed post, a feed URL with a token, or anything from a scheduled post that did not go out", async () => {
    const { t, alice, bob, aliceId } = await setup();
    await alice.mutation(api.users.setDisplayName, { displayName: "Alice" });
    const { slug } = await alice.mutation(api.circle.setProfile, { public: true });
    await bob.mutation(api.circle.follow, { slug: slug! });
    const publishId = await t.run(async (ctx) =>
      ctx.db.insert("publishes", { userId: aliceId, kind: "manual", platform: "linkedin", status: "posting", createdAt: Date.now(), text: "Draft that failed" }),
    );
    await t.mutation(internal.social.finishPublish, { publishId, status: "failed", error: "nope" });
    expect((await bob.query(api.circle.following, {})).posts).toEqual([]);

    await alicePosts(t, aliceId, "https://private.example/feed?token=abc123");
    const [post] = (await bob.query(api.circle.following, {})).posts;
    expect(post.feedUrl).toBeNull();
    expect(post.itemLink).toBe("https://blog.example/a");
  });

  it("deleting an account removes its follows (both ways), its shared posts and fixes the other side's counters", async () => {
    vi.useFakeTimers();
    const { t, alice, bob, aliceId, bobId } = await setup();
    await alice.mutation(api.users.setDisplayName, { displayName: "Alice" });
    await bob.mutation(api.users.setDisplayName, { displayName: "Bob" });
    const a = (await alice.mutation(api.circle.setProfile, { public: true })).slug!;
    const b = (await bob.mutation(api.circle.setProfile, { public: true })).slug!;
    await alice.mutation(api.circle.follow, { slug: b });
    await bob.mutation(api.circle.follow, { slug: a });
    await alicePosts(t, aliceId);

    await t.mutation(internal.users.deleteBatch, { userId: aliceId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const left = await t.run(async (ctx) => ({
      follows: (await ctx.db.query("follows").collect()).length,
      posts: (await ctx.db.query("sharedPosts").collect()).length,
      alice: await ctx.db.get(aliceId),
      bob: await ctx.db.get(bobId),
    }));
    expect(left).toMatchObject({ follows: 0, posts: 0, alice: null });
    expect(left.bob).toMatchObject({ followerCount: 0, followingCount: 0 });
  });
});

describe("publicFeedUrl", () => {
  it.each([
    ["https://blog.example/feed.xml", "https://blog.example/feed.xml"],
    ["https://u:p@blog.example/feed", undefined],
    ["https://blog.example/feed?key=1", undefined],
    ["https://blog.example/private/feed.xml", undefined],
    ["https://blog.example/feeds/token-abc/rss", undefined],
    ["ftp://blog.example/feed", undefined],
  ])("%s", (url, want) => expect(publicFeedUrl(url)).toBe(want));
});
