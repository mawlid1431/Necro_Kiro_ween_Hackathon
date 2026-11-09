// Covens: shared feed collections (spec: .kiro/specs/covens).
// Everything returned here is public-by-design: a collection's own fields plus the curator's display
// name. No query in this file reads another user's graves, items, drafts or email.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { collectionTopic } from "./schema";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { hitLimit } from "./rateLimits";
import { MAX_COLLECTIONS_PER_USER, MAX_FEEDS_PER_COLLECTION, PUBLISHES_PER_HOUR, REPORTS_TO_HIDE } from "../lib/limits";

const visibility = v.union(v.literal("public"), v.literal("unlisted"));
const SLUG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (0/o, 1/l/i)
export const ANONYMOUS_CURATOR = "A Necro reader";

export type CollectionCard = {
  _id: Id<"collections">;
  slug: string;
  title: string;
  description: string;
  topic: Doc<"collections">["topic"];
  visibility: Doc<"collections">["visibility"];
  feedCount: number;
  followerCount: number;
  subscribeCount: number;
  curator: string;
  starredFeed: boolean;
  updatedAt: number;
  preview: string[]; // first few feed titles
};

function card(c: Doc<"collections">, curator: string): CollectionCard {
  return {
    _id: c._id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    topic: c.topic,
    visibility: c.visibility,
    feedCount: c.feeds.length,
    followerCount: c.followerCount,
    subscribeCount: c.subscribeCount,
    curator,
    starredFeed: c.starredFeed,
    updatedAt: c.updatedAt,
    preview: c.feeds.slice(0, 4).map((f) => f.title),
  };
}

/** Public display names for a set of curators. Never the email or the private Clerk name. */
async function curatorNames(ctx: QueryCtx, ids: Id<"users">[]): Promise<Map<Id<"users">, string>> {
  const out = new Map<Id<"users">, string>();
  for (const id of new Set(ids)) {
    const u = await ctx.db.get(id);
    out.set(id, u?.displayName?.trim() || ANONYMOUS_CURATOR);
  }
  return out;
}

function cleanText(s: string, min: number, max: number, field: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < min || t.length > max) fail("INVALID_INPUT", `${field} must be ${min} to ${max} characters.`);
  return t;
}

async function snapshotFeeds(ctx: MutationCtx, userId: Id<"users">, graveIds: Id<"graves">[]) {
  const unique = [...new Set(graveIds)];
  if (unique.length < 1 || unique.length > MAX_FEEDS_PER_COLLECTION) {
    fail("INVALID_INPUT", `Pick 1 to ${MAX_FEEDS_PER_COLLECTION} feeds.`);
  }
  const feeds = [];
  for (const id of unique) {
    const g = await requireOwned(ctx, userId, id); // only your own feeds can be shared
    feeds.push({ feedUrl: g.feedUrl, title: (g.customTitle ?? g.title).slice(0, 200), siteUrl: g.siteUrl });
  }
  return feeds;
}

async function newSlug(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let slug = "";
    for (let i = 0; i < 10; i++) slug += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
    const clash = await ctx.db.query("collections").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!clash) return slug;
  }
  fail("LIMIT", "Could not create a link. Try again.");
}

// ---------- my collections ----------

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("collections").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_COLLECTIONS_PER_USER);
    const name = user.displayName?.trim() || ANONYMOUS_CURATOR;
    return rows.map((c) => ({ ...card(c, name), hidden: c.hidden, feeds: c.feeds }));
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    topic: collectionTopic,
    visibility,
    graveIds: v.array(v.id("graves")),
    starredFeed: v.optional(v.boolean()),
  },
  handler: async (ctx, a): Promise<{ collectionId: Id<"collections">; slug: string }> => {
    const user = await requireUser(ctx);
    const title = cleanText(a.title, 3, 80, "Title");
    const description = cleanText(a.description, 0, 280, "Description");
    const count = (await ctx.db.query("collections").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_COLLECTIONS_PER_USER)).length;
    if (count >= MAX_COLLECTIONS_PER_USER) fail("LIMIT", `You can publish up to ${MAX_COLLECTIONS_PER_USER} collections.`);
    if (!(await hitLimit(ctx, `publish:${user._id}`, PUBLISHES_PER_HOUR, 3_600_000))) {
      fail("LIMIT", "You published a lot just now. Try again in an hour.");
    }
    const feeds = await snapshotFeeds(ctx, user._id, a.graveIds);
    const slug = await newSlug(ctx);
    const collectionId = await ctx.db.insert("collections", {
      userId: user._id,
      slug,
      title,
      description,
      topic: a.topic,
      visibility: a.visibility,
      feeds,
      starredFeed: a.starredFeed ?? false,
      followerCount: 0,
      subscribeCount: 0,
      reportCount: 0,
      hidden: false,
      updatedAt: Date.now(),
    });
    return { collectionId, slug };
  },
});

export const update = mutation({
  args: {
    collectionId: v.id("collections"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    topic: v.optional(collectionTopic),
    visibility: v.optional(visibility),
    graveIds: v.optional(v.array(v.id("graves"))),
    starredFeed: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const c = await requireOwned(ctx, user._id, a.collectionId);
    const patch: Partial<Doc<"collections">> = { updatedAt: Date.now() };
    if (a.title !== undefined) patch.title = cleanText(a.title, 3, 80, "Title");
    if (a.description !== undefined) patch.description = cleanText(a.description, 0, 280, "Description");
    if (a.topic !== undefined) patch.topic = a.topic;
    if (a.visibility !== undefined) patch.visibility = a.visibility;
    if (a.starredFeed !== undefined) patch.starredFeed = a.starredFeed;
    if (a.graveIds !== undefined) patch.feeds = await snapshotFeeds(ctx, user._id, a.graveIds);
    await ctx.db.patch(c._id, patch);
  },
});

export const remove = mutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, collectionId);
    await removeCollection(ctx, collectionId);
  },
});

/** Deletes a collection with its follows and reports (bounded; follows beyond 500 are left orphaned and harmless). */
export async function removeCollection(ctx: MutationCtx, collectionId: Id<"collections">) {
  for (const f of await ctx.db.query("collectionFollows").withIndex("by_collection", (q) => q.eq("collectionId", collectionId)).take(500)) {
    await ctx.db.delete(f._id);
  }
  for (const r of await ctx.db.query("collectionReports").withIndex("by_collection", (q) => q.eq("collectionId", collectionId)).take(500)) {
    await ctx.db.delete(r._id);
  }
  await ctx.db.delete(collectionId);
}

// ---------- discover (public data only) ----------

export const discover = query({
  args: {
    topic: v.optional(collectionTopic),
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("trending"), v.literal("new"))),
  },
  handler: async (ctx, { topic, search, sort = "trending" }): Promise<CollectionCard[]> => {
    let rows: Doc<"collections">[];
    const term = search?.trim().slice(0, 100);
    if (term) {
      rows = await ctx.db
        .query("collections")
        .withSearchIndex("search_title", (q) => {
          const s = q.search("title", term).eq("visibility", "public").eq("hidden", false);
          return topic ? s.eq("topic", topic) : s;
        })
        .take(30);
    } else if (sort === "new") {
      rows = topic
        ? await ctx.db.query("collections").withIndex("by_public_topic_new", (q) => q.eq("visibility", "public").eq("hidden", false).eq("topic", topic)).order("desc").take(30)
        : await ctx.db.query("collections").withIndex("by_public_new", (q) => q.eq("visibility", "public").eq("hidden", false)).order("desc").take(30);
    } else {
      rows = topic
        ? await ctx.db.query("collections").withIndex("by_public_topic", (q) => q.eq("visibility", "public").eq("hidden", false).eq("topic", topic)).order("desc").take(30)
        : await ctx.db.query("collections").withIndex("by_public_followers", (q) => q.eq("visibility", "public").eq("hidden", false)).order("desc").take(30);
    }
    const names = await curatorNames(ctx, rows.map((r) => r.userId));
    return rows.map((c) => card(c, names.get(c.userId) ?? ANONYMOUS_CURATOR));
  },
});

/** One collection by its link. Public or unlisted; hidden ones only for their owner. */
export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await ctx.db.query("collections").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    const viewer = await getCurrentUser(ctx);
    const isOwner = !!viewer && !!c && c.userId === viewer._id;
    if (!c || (c.hidden && !isOwner)) return null;
    const names = await curatorNames(ctx, [c.userId]);
    const alreadyHave: string[] = [];
    let following = false;
    if (viewer) {
      for (const f of c.feeds) {
        const g = await ctx.db.query("graves").withIndex("by_user_feedUrl", (q) => q.eq("userId", viewer._id).eq("feedUrl", f.feedUrl)).first();
        if (g) alreadyHave.push(f.feedUrl);
      }
      following = !!(await ctx.db.query("collectionFollows").withIndex("by_user_collection", (q) => q.eq("userId", viewer._id).eq("collectionId", c._id)).first());
    }
    return { ...card(c, names.get(c.userId) ?? ANONYMOUS_CURATOR), feeds: c.feeds, hidden: c.hidden, isOwner, following, alreadyHave };
  },
});

/** Most-shared feeds across public collections, weighted by followers. */
export const trendingFeeds = query({
  args: {},
  handler: async (ctx) => {
    const top = await ctx.db.query("collections").withIndex("by_public_followers", (q) => q.eq("visibility", "public").eq("hidden", false)).order("desc").take(50);
    const score = new Map<string, { feedUrl: string; title: string; siteUrl?: string; score: number; collections: number }>();
    for (const c of top) {
      for (const f of c.feeds) {
        const row = score.get(f.feedUrl) ?? { feedUrl: f.feedUrl, title: f.title, siteUrl: f.siteUrl, score: 0, collections: 0 };
        row.score += 1 + c.followerCount;
        row.collections += 1;
        score.set(f.feedUrl, row);
      }
    }
    return [...score.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  },
});

// ---------- follow and report ----------

async function visibleForAction(ctx: QueryCtx, collectionId: Id<"collections">) {
  const c = await ctx.db.get(collectionId);
  if (!c || c.hidden) fail("NOT_FOUND", "That collection could not be found.");
  return c;
}

export const follow = mutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const user = await requireUser(ctx);
    const c = await visibleForAction(ctx, collectionId);
    if (c.userId === user._id) fail("INVALID_INPUT", "You can't follow your own collection.");
    await ensureFollow(ctx, user._id, c);
  },
});

async function ensureFollow(ctx: MutationCtx, userId: Id<"users">, c: Doc<"collections">) {
  const existing = await ctx.db.query("collectionFollows").withIndex("by_user_collection", (q) => q.eq("userId", userId).eq("collectionId", c._id)).first();
  if (existing || c.userId === userId) return;
  await ctx.db.insert("collectionFollows", { userId, collectionId: c._id });
  await ctx.db.patch(c._id, { followerCount: c.followerCount + 1 });
}

export const unfollow = mutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.query("collectionFollows").withIndex("by_user_collection", (q) => q.eq("userId", user._id).eq("collectionId", collectionId)).first();
    if (!row) return;
    await ctx.db.delete(row._id);
    const c = await ctx.db.get(collectionId);
    if (c) await ctx.db.patch(c._id, { followerCount: Math.max(0, c.followerCount - 1) });
  },
});

/** Collections I follow, with how many of their feeds I don't have yet. */
export const following = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const follows = await ctx.db.query("collectionFollows").withIndex("by_user", (q) => q.eq("userId", user._id)).take(100);
    const out = [];
    for (const f of follows) {
      const c = await ctx.db.get(f.collectionId);
      if (!c || c.hidden) continue;
      let missing = 0;
      for (const feed of c.feeds) {
        const g = await ctx.db.query("graves").withIndex("by_user_feedUrl", (q) => q.eq("userId", user._id).eq("feedUrl", feed.feedUrl)).first();
        if (!g) missing++;
      }
      const names = await curatorNames(ctx, [c.userId]);
      out.push({ ...card(c, names.get(c.userId) ?? ANONYMOUS_CURATOR), missing });
    }
    return out;
  },
});

export const report = mutation({
  args: { collectionId: v.id("collections"), reason: v.string() },
  handler: async (ctx, { collectionId, reason }) => {
    const user = await requireUser(ctx);
    const c = await visibleForAction(ctx, collectionId);
    if (c.userId === user._id) fail("INVALID_INPUT", "You can't report your own collection.");
    const existing = await ctx.db.query("collectionReports").withIndex("by_user_collection", (q) => q.eq("userId", user._id).eq("collectionId", c._id)).first();
    if (existing) return { alreadyReported: true };
    await ctx.db.insert("collectionReports", { userId: user._id, collectionId: c._id, reason: cleanText(reason || "No reason given", 1, 280, "Reason") });
    const reportCount = c.reportCount + 1;
    await ctx.db.patch(c._id, { reportCount, hidden: reportCount >= REPORTS_TO_HIDE });
    return { alreadyReported: false };
  },
});

// ---------- internal: subscribe, HTTP feeds, starters ----------

export const forSubscribe = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await ctx.db.query("collections").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!c || c.hidden) return null;
    return { _id: c._id, title: c.title, userId: c.userId, feeds: c.feeds };
  },
});

export const recordSubscribe = internalMutation({
  args: { userId: v.id("users"), collectionId: v.id("collections") },
  handler: async (ctx, { userId, collectionId }) => {
    const c = await ctx.db.get(collectionId);
    if (!c) return;
    await ctx.db.patch(c._id, { subscribeCount: c.subscribeCount + 1 });
    await ensureFollow(ctx, userId, { ...c, subscribeCount: c.subscribeCount + 1 });
  },
});

/** For the public OPML and starred-RSS endpoints (convex/http.ts). */
export const publicFeed = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await ctx.db.query("collections").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!c || c.hidden) return null;
    const curator = (await curatorNames(ctx, [c.userId])).get(c.userId) ?? ANONYMOUS_CURATOR;
    let starred: { title: string; link?: string; excerpt: string; publishedAt: number }[] = [];
    if (c.starredFeed) {
      const items = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", c.userId).eq("isStarred", true)).order("desc").take(50);
      starred = items.map((i) => ({ title: i.title, link: i.link, excerpt: i.excerpt, publishedAt: i.publishedAt }));
    }
    return { title: c.title, description: c.description, curator, feeds: c.feeds, starredFeed: c.starredFeed, starred, updatedAt: c.updatedAt };
  },
});

export const upsertCurator = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const existing = await ctx.db.query("users").withIndex("by_clerk", (q) => q.eq("clerkId", "necro_curators")).first();
    if (existing) return existing._id;
    return await ctx.db.insert("users", {
      tokenIdentifier: "system|necro_curators", // no Clerk login can ever match this
      clerkId: "necro_curators",
      name: "Necro Curators",
      displayName: "Necro Curators",
      interests: [],
      createdAt: Date.now(),
    });
  },
});

export const upsertStarter = internalMutation({
  args: {
    userId: v.id("users"),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    topic: collectionTopic,
    feeds: v.array(v.object({ feedUrl: v.string(), title: v.string(), siteUrl: v.optional(v.string()) })),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("collections").withIndex("by_slug", (q) => q.eq("slug", a.slug)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { title: a.title, description: a.description, topic: a.topic, feeds: a.feeds, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("collections", {
      ...a,
      visibility: "public",
      starredFeed: false,
      followerCount: 0,
      subscribeCount: 0,
      reportCount: 0,
      hidden: false,
      updatedAt: Date.now(),
    });
  },
});
