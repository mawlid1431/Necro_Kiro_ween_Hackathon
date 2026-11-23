// The Circle: follow people, see what they publish, find people in your topics (spec: .kiro/specs/circle).
//
// Privacy rules, enforced here and nowhere else:
// - A profile is invisible until its owner turns profilePublic on, and visibility is checked on every read,
//   so turning it off hides the profile and every post at once, everywhere.
// - Only posts that already went out to a social network through Necro (publishes.status "posted") are shared.
//   Never drafts, reading history, feeds you follow, the email or the Clerk name (only displayName).
// - A post's feed URL is shared only when it is a plain public address (no credentials, no query string).

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, requireUser } from "./lib/auth";
import { classifyTopic, topicsOfInterests, type Topic } from "../lib/topics";
import { scheduleLearn } from "./learning";

export const MAX_FOLLOWING = 500;
export const FOLLOWS_PER_MINUTE = 30;
const FEED_POSTS_PER_PERSON = 10;
const PAGE = 50;
const BIO_MAX = 160;

// ---------- recording (called when a publish becomes "posted") ----------

/** A feed address that is safe to show to other people: https/http, no user:pass, no query (tokens live there). */
export function publicFeedUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (u.username || u.password || u.search) return undefined;
    if (/(token|secret|apikey|api_key|auth|private)/i.test(u.pathname)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function httpUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records a published post for the Circle. Idempotent (one row per publish), so calling it from every path
 * that marks a publish "posted" is safe. Runs inside that same mutation, so a post is recorded exactly once.
 */
export async function recordShared(ctx: MutationCtx, publishId: Id<"publishes">): Promise<void> {
  const p = await ctx.db.get(publishId);
  if (!p || p.status !== "posted") return;
  const existing = await ctx.db.query("sharedPosts").withIndex("by_publish", (q) => q.eq("publishId", publishId)).first();
  if (existing) return;

  const item = p.itemId ? await ctx.db.get(p.itemId) : null;
  const draft = p.draftId ? await ctx.db.get(p.draftId) : null;
  const grave = item ? await ctx.db.get(item.graveId) : null;
  const text = (p.text ?? draft?.text ?? "").trim().slice(0, 600);
  if (!text && !item) return;

  const postedAt = p.finishedAt ?? Date.now();
  await ctx.db.insert("sharedPosts", {
    userId: p.userId,
    publishId,
    platform: p.platform,
    text,
    url: httpUrl(p.url),
    itemTitle: item?.title.slice(0, 300),
    itemLink: httpUrl(item?.link),
    imageUrl: item?.imageUrl,
    feedTitle: grave ? (grave.customTitle ?? grave.title).slice(0, 200) : undefined,
    feedUrl: publicFeedUrl(grave?.feedUrl),
    topic: item?.topic ?? classifyTopic({ title: text }),
    postedAt,
  });
  await scheduleLearn(ctx, p.userId); // a published post is the strongest signal of what this reader cares about
  const user = await ctx.db.get(p.userId);
  if (user) await ctx.db.patch(user._id, { sharedCount: (user.sharedCount ?? 0) + 1, lastSharedAt: Math.max(user.lastSharedAt ?? 0, postedAt) });
}

// ---------- views ----------

type Ctx = QueryCtx | MutationCtx;

export type CircleAuthor = { slug: string; name: string; bio: string | null };

function authorOf(u: Doc<"users">): CircleAuthor | null {
  if (!u.profilePublic || !u.publicSlug || !u.displayName?.trim()) return null;
  return { slug: u.publicSlug, name: u.displayName.trim(), bio: u.bio ?? null };
}

function postView(p: Doc<"sharedPosts">) {
  return {
    _id: p._id,
    platform: p.platform,
    text: p.text,
    url: p.url ?? null,
    itemTitle: p.itemTitle ?? null,
    itemLink: p.itemLink ?? null,
    imageUrl: p.imageUrl ?? null,
    feedTitle: p.feedTitle ?? null,
    feedUrl: p.feedUrl ?? null,
    topic: p.topic,
    postedAt: p.postedAt,
  };
}

export type CirclePost = ReturnType<typeof postView> & { author: CircleAuthor; isFollowing: boolean };

async function followingIds(ctx: Ctx, me: Id<"users">): Promise<Set<Id<"users">>> {
  const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me)).take(MAX_FOLLOWING);
  return new Set(rows.map((r) => r.followeeId));
}

/** Topics a reader cares about: their stated interests plus the topics they actually read most (3+ recent articles). */
async function myTopics(ctx: Ctx, me: Doc<"users">): Promise<Topic[]> {
  const out = new Set<Topic>(topicsOfInterests(me.interests));
  const recent = await ctx.db.query("items").withIndex("by_user_risen", (q) => q.eq("userId", me._id)).order("desc").take(150);
  const count = new Map<Topic, number>();
  for (const i of recent) if (i.topic && i.topic !== "other") count.set(i.topic, (count.get(i.topic) ?? 0) + 1);
  [...count.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .forEach(([t]) => out.add(t));
  return [...out];
}

function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base || "reader";
}

async function uniqueSlug(ctx: MutationCtx, name: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await ctx.db.query("users").withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug)).first();
    if (!taken) return slug;
  }
  fail("INVALID_INPUT", "Could not create a profile address. Try again.");
}

async function bySlug(ctx: Ctx, slug: string) {
  return await ctx.db.query("users").withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug.slice(0, 64))).first();
}

// ---------- your profile ----------

/** Your Circle settings and counts. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await requireUser(ctx);
    return {
      profilePublic: !!u.profilePublic,
      slug: u.publicSlug ?? null,
      displayName: u.displayName ?? null,
      bio: u.bio ?? null,
      followerCount: u.followerCount ?? 0,
      followingCount: u.followingCount ?? 0,
      sharedCount: u.sharedCount ?? 0,
    };
  },
});

/** Turn your public profile on or off, and set a short bio. A display name is required to go public. */
export const setProfile = mutation({
  args: { public: v.boolean(), bio: v.optional(v.string()) },
  handler: async (ctx, { public: isPublic, bio }) => {
    const u = await requireUser(ctx);
    const patch: Partial<Doc<"users">> = { profilePublic: isPublic };
    if (bio !== undefined) {
      const b = bio.replace(/\s+/g, " ").trim();
      if (b.length > BIO_MAX) fail("INVALID_INPUT", `Keep your bio under ${BIO_MAX} characters.`);
      patch.bio = b || undefined;
    }
    if (isPublic) {
      if (!u.displayName?.trim()) fail("INVALID_INPUT", "Add a display name first, so people know who they follow.");
      if (!u.publicSlug) patch.publicSlug = await uniqueSlug(ctx, u.displayName);
    }
    await ctx.db.patch(u._id, patch);
    return { slug: patch.publicSlug ?? u.publicSlug ?? null };
  },
});

// ---------- follow ----------

export const follow = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const me = await requireUser(ctx);
    const target = await bySlug(ctx, slug);
    if (!target || !authorOf(target)) fail("NOT_FOUND", "This profile is private or no longer exists.");
    if (target._id === me._id) fail("INVALID_INPUT", "You cannot follow yourself.");
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", me._id).eq("followeeId", target._id))
      .first();
    if (existing) return { following: true };
    if ((me.followingCount ?? 0) >= MAX_FOLLOWING) fail("LIMIT", `You can follow up to ${MAX_FOLLOWING} people.`);
    const now = Date.now();
    const lastMinute = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", me._id).gt("createdAt", now - 60_000))
      .take(FOLLOWS_PER_MINUTE);
    if (lastMinute.length >= FOLLOWS_PER_MINUTE) fail("LIMIT", "That is a lot of follows at once. Wait a minute and try again.");
    await ctx.db.insert("follows", { followerId: me._id, followeeId: target._id, createdAt: now });
    await ctx.db.patch(me._id, { followingCount: (me.followingCount ?? 0) + 1 });
    await ctx.db.patch(target._id, { followerCount: (target.followerCount ?? 0) + 1 });
    return { following: true };
  },
});

export const unfollow = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const me = await requireUser(ctx);
    const target = await bySlug(ctx, slug);
    if (!target) return { following: false };
    const row = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", me._id).eq("followeeId", target._id))
      .first();
    if (!row) return { following: false };
    await removeFollow(ctx, row);
    return { following: false };
  },
});

/** Deletes one follow row and keeps both counters right. Also used by account deletion. */
export async function removeFollow(ctx: MutationCtx, row: Doc<"follows">) {
  await ctx.db.delete(row._id);
  const a = await ctx.db.get(row.followerId);
  if (a) await ctx.db.patch(a._id, { followingCount: Math.max(0, (a.followingCount ?? 0) - 1) });
  const b = await ctx.db.get(row.followeeId);
  if (b) await ctx.db.patch(b._id, { followerCount: Math.max(0, (b.followerCount ?? 0) - 1) });
}

// ---------- streams ----------

/** Posts by people you follow, newest first. Live: a new post or a profile switched off shows at once. */
export const following = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me._id)).order("desc").take(MAX_FOLLOWING);
    const posts: CirclePost[] = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.followeeId);
      const author = u && authorOf(u);
      if (!author) continue;
      const ps = await ctx.db.query("sharedPosts").withIndex("by_user_posted", (q) => q.eq("userId", u._id)).order("desc").take(FEED_POSTS_PER_PERSON);
      for (const p of ps) posts.push({ ...postView(p), author, isFollowing: true });
    }
    posts.sort((a, b) => b.postedAt - a.postedAt);
    return { followingCount: rows.length, posts: posts.slice(0, PAGE) };
  },
});

/** Published posts in your topics from public profiles you do not follow yet: how you find new people. */
export const inMyTopics = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const topics = await myTopics(ctx, me);
    const followed = await followingIds(ctx, me._id);
    const authors = new Map<Id<"users">, CircleAuthor | null>();
    const posts: CirclePost[] = [];
    for (const t of topics) {
      const ps = await ctx.db.query("sharedPosts").withIndex("by_topic_posted", (q) => q.eq("topic", t)).order("desc").take(30);
      for (const p of ps) {
        if (p.userId === me._id || followed.has(p.userId)) continue;
        if (!authors.has(p.userId)) {
          const u = await ctx.db.get(p.userId);
          authors.set(p.userId, u ? authorOf(u) : null);
        }
        const author = authors.get(p.userId);
        if (author) posts.push({ ...postView(p), author, isFollowing: false });
      }
    }
    posts.sort((a, b) => b.postedAt - a.postedAt);
    return { topics, posts: posts.slice(0, PAGE) };
  },
});

/** People to follow: public profiles, ranked by shared topics, then by how recently they posted. */
export const people = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const mine = new Set(await myTopics(ctx, me));
    const followed = await followingIds(ctx, me._id);
    const users = await ctx.db.query("users").withIndex("by_profilePublic", (q) => q.eq("profilePublic", true)).order("desc").take(100);
    const out = [];
    for (const u of users) {
      if (u._id === me._id) continue;
      const author = authorOf(u);
      if (!author) continue;
      const recent = await ctx.db.query("sharedPosts").withIndex("by_user_posted", (q) => q.eq("userId", u._id)).order("desc").take(10);
      const theirs = new Set<Topic>([...topicsOfInterests(u.interests), ...recent.map((p) => p.topic).filter((t) => t !== "other")]);
      const shared = [...theirs].filter((t) => mine.has(t));
      out.push({
        ...author,
        topics: [...theirs].slice(0, 4),
        sharedTopics: shared,
        followerCount: u.followerCount ?? 0,
        postCount: u.sharedCount ?? 0,
        lastSharedAt: u.lastSharedAt ?? null,
        isFollowing: followed.has(u._id),
      });
    }
    out.sort((a, b) => b.sharedTopics.length - a.sharedTopics.length || (b.lastSharedAt ?? 0) - (a.lastSharedAt ?? 0));
    return out.slice(0, 30);
  },
});

/** One profile and its posts. Private profiles return null, except your own (so you can preview it). */
export const profile = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const me = await requireUser(ctx);
    const u = await bySlug(ctx, slug);
    if (!u) return null;
    const isMe = u._id === me._id;
    const author = authorOf(u);
    if (!author && !isMe) return null;
    const following = isMe
      ? false
      : !!(await ctx.db.query("follows").withIndex("by_pair", (q) => q.eq("followerId", me._id).eq("followeeId", u._id)).first());
    const posts = await ctx.db.query("sharedPosts").withIndex("by_user_posted", (q) => q.eq("userId", u._id)).order("desc").take(PAGE);
    const name = author?.name ?? u.displayName ?? "You";
    return {
      slug,
      name,
      bio: u.bio ?? null,
      isMe,
      isPublic: !!author,
      isFollowing: following,
      followerCount: u.followerCount ?? 0,
      followingCount: u.followingCount ?? 0,
      topics: [...new Set([...topicsOfInterests(u.interests), ...posts.map((p) => p.topic).filter((t) => t !== "other")])].slice(0, 5),
      posts: posts.map((p) => ({ ...postView(p), author: { slug, name, bio: u.bio ?? null }, isFollowing: following })),
    };
  },
});
