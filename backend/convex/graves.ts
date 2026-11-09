import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { afterFailure, afterSuccess } from "../lib/schedule";
import { exportOpml as buildOpml } from "../lib/feeds/opml";
import { faviconFor, normaliseFeedUrl } from "../lib/feeds/url";

import { MAX_GRAVES_PER_USER } from "../lib/limits";
import { unindexItem } from "./kindred";
import { unmatchItem } from "./omens";
const MIN = 60_000;

/** The fields the UI needs for a tombstone (no fetch internals like etag). */
function card(g: Doc<"graves">) {
  return {
    _id: g._id,
    _creationTime: g._creationTime,
    title: g.customTitle ?? g.title,
    feedTitle: g.title,
    feedUrl: g.feedUrl,
    siteUrl: g.siteUrl,
    iconUrl: g.iconUrl,
    folder: g.folder,
    status: g.status,
    unreadCount: g.unreadCount,
    lastFetchedAt: g.lastFetchedAt,
    lastNewItemAt: g.lastNewItemAt,
    lastErrorCode: g.lastErrorCode,
    failureCount: g.failureCount,
  };
}

// ---------- public ----------

/** The caller's feeds with unread counts (max 300, not paginated). Signed-out callers get []. */
export const list = query({
  args: { folder: v.optional(v.string()) },
  handler: async (ctx, { folder }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows =
      folder === undefined
        ? await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_GRAVES_PER_USER)
        : await ctx.db
            .query("graves")
            .withIndex("by_user_folder", (q) => q.eq("userId", user._id).eq("folder", folder))
            .take(MAX_GRAVES_PER_USER);
    return rows.map(card);
  },
});

export const get = query({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }) => {
    const user = await requireUser(ctx);
    const g = await requireOwned(ctx, user._id, graveId);
    return { ...card(g), format: g.format, lastErrorDetail: g.lastErrorDetail, doctorNote: g.doctorNote };
  },
});

export const folders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_GRAVES_PER_USER);
    const counts = new Map<string, number>();
    for (const g of rows) if (g.folder) counts.set(g.folder, (counts.get(g.folder) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const rename = mutation({
  args: { graveId: v.id("graves"), title: v.string() },
  handler: async (ctx, { graveId, title }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, graveId);
    const t = title.trim();
    if (t.length > 200) fail("INVALID_INPUT", "Titles can be up to 200 characters.");
    await ctx.db.patch(graveId, { customTitle: t || undefined }); // empty resets to the feed's own title
  },
});

export const moveToFolder = mutation({
  args: { graveId: v.id("graves"), folder: v.optional(v.string()) },
  handler: async (ctx, { graveId, folder }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, graveId);
    const f = folder?.trim();
    if (f && f.length > 60) fail("INVALID_INPUT", "Folder names can be up to 60 characters.");
    await ctx.db.patch(graveId, { folder: f || undefined });
  },
});

/** Unsubscribe: deletes the grave now and its items, Séances and drafts in scheduled batches. */
export const layToRest = mutation({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, graveId);
    await ctx.db.delete(graveId);
    await ctx.scheduler.runAfter(0, internal.graves.deleteGraveData, { graveId });
  },
});

export const exportOpml = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_GRAVES_PER_USER);
    return buildOpml(
      rows.map((g) => ({ title: g.customTitle ?? g.title, feedUrl: g.feedUrl, siteUrl: g.siteUrl ?? null, folder: g.folder ?? null })),
      user.name ?? "Necro user",
    );
  },
});

/**
 * "Export my data": everything the user created, as JSON (feeds as OPML inside it).
 * Article bodies are left out (they belong to their publishers and are large); titles and links stay.
 */
export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const uid = user._id;
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", uid)).take(MAX_GRAVES_PER_USER);
    const titleOf = async (id: Id<"items">) => {
      const i = await ctx.db.get(id);
      return i && i.userId === uid ? { title: i.title, link: i.link ?? null } : null;
    };
    const voice = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", uid)).first();
    const drafts = await ctx.db.query("drafts").withIndex("by_user", (q) => q.eq("userId", uid)).take(500);
    const omens = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", uid)).take(20);
    const matches = await ctx.db.query("omenMatches").withIndex("by_user_created", (q) => q.eq("userId", uid)).order("desc").take(200);
    const collections = await ctx.db.query("collections").withIndex("by_user", (q) => q.eq("userId", uid)).take(20);
    const follows = await ctx.db.query("collectionFollows").withIndex("by_user", (q) => q.eq("userId", uid)).take(100);
    const grimoires = await ctx.db.query("grimoires").withIndex("by_user", (q) => q.eq("userId", uid)).order("desc").take(50);
    const starred = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", uid).eq("isStarred", true)).order("desc").take(500);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: user.name ?? null,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        interests: user.interests,
        summaryLanguage: user.summaryLanguage ?? "English",
        privateMode: user.privateMode ?? false,
      },
      voice: voice ? { tone: voice.tone, audience: voice.audience, wordsToUse: voice.wordsToUse, wordsToAvoid: voice.wordsToAvoid, samplePosts: voice.samplePosts } : null,
      feeds: graves.map((g) => ({ title: g.customTitle ?? g.title, feedUrl: g.feedUrl, siteUrl: g.siteUrl ?? null, folder: g.folder ?? null })),
      opml: buildOpml(
        graves.map((g) => ({ title: g.customTitle ?? g.title, feedUrl: g.feedUrl, siteUrl: g.siteUrl ?? null, folder: g.folder ?? null })),
        user.name ?? "Necro user",
      ),
      starred: starred.map((i) => ({ title: i.title, link: i.link ?? null, publishedAt: new Date(i.publishedAt).toISOString() })),
      drafts: await Promise.all(drafts.map(async (d) => ({ platform: d.platform, text: d.text, hashtags: d.hashtags, status: d.status, article: await titleOf(d.itemId) }))),
      omens: omens.map((o) => ({ topic: o.topic, strict: o.strict, muted: o.muted, matchCount: o.matchCount })),
      omenMatches: await Promise.all(
        matches.map(async (m) => ({ topic: omens.find((o) => o._id === m.omenId)?.topic ?? null, reason: m.reason, via: m.via, article: await titleOf(m.itemId) })),
      ),
      collections: collections.map((c) => ({ title: c.title, description: c.description, topic: c.topic, visibility: c.visibility, slug: c.slug, feeds: c.feeds })),
      following: (await Promise.all(follows.map(async (f) => (await ctx.db.get(f.collectionId))?.slug ?? null))).filter((s): s is string => !!s),
      grimoires: grimoires.map((g) => ({ weekOf: g.weekOf, title: g.title, markdown: g.markdown })),
    };
  },
});

// ---------- internal: used by feedsNode, doctorNode, mcp ----------

export const iconsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("graves").paginate({ numItems: 25, cursor });
    return { graves: page.page.map((g) => ({ _id: g._id, iconUrl: g.iconUrl, siteUrl: g.siteUrl })), isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const setIcon = internalMutation({
  args: { graveId: v.id("graves"), iconUrl: v.string() },
  handler: async (ctx, { graveId, iconUrl }) => {
    if (await ctx.db.get(graveId)) await ctx.db.patch(graveId, { iconUrl });
  },
});

export const countForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    (await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_GRAVES_PER_USER + 1)).length,
});

export const byFeedUrl = internalQuery({
  args: { userId: v.id("users"), feedUrl: v.string() },
  handler: (ctx, { userId, feedUrl }) =>
    ctx.db
      .query("graves")
      .withIndex("by_user_feedUrl", (q) => q.eq("userId", userId).eq("feedUrl", feedUrl))
      .first(),
});

export const getInternal = internalQuery({
  args: { graveId: v.id("graves") },
  handler: (ctx, { graveId }) => ctx.db.get(graveId),
});

/** Owner-checked load for actions that received a graveId from a client. */
export const getOwnedInternal = internalQuery({
  args: { userId: v.id("users"), graveId: v.id("graves") },
  handler: (ctx, { userId, graveId }) => requireOwned(ctx, userId, graveId),
});

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    feedUrl: v.string(),
    siteUrl: v.optional(v.string()),
    title: v.string(),
    iconUrl: v.optional(v.string()),
    folder: v.optional(v.string()),
    format: v.optional(v.string()),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotent: a retried action must not create a second grave for the same feed.
    const existing = await ctx.db
      .query("graves")
      .withIndex("by_user_feedUrl", (q) => q.eq("userId", args.userId).eq("feedUrl", args.feedUrl))
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("graves", {
      ...args,
      title: args.title.slice(0, 200),
      status: "alive",
      lastFetchedAt: now,
      nextFetchAt: now + 15 * MIN,
      failureCount: 0,
      unreadCount: 0,
    });
  },
});

/** OPML import: creates graves without fetching; the poller picks them up 2 s apart. */
export const createMany = internalMutation({
  args: {
    userId: v.id("users"),
    feeds: v.array(
      v.object({ title: v.string(), feedUrl: v.string(), siteUrl: v.optional(v.string()), folder: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, { userId, feeds }) => {
    const existing = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_GRAVES_PER_USER + 1);
    const have = new Set(existing.map((g) => g.feedUrl));
    let room = MAX_GRAVES_PER_USER - existing.length;
    let created = 0;
    let duplicates = 0;
    let skipped = 0;
    const now = Date.now();
    for (const f of feeds) {
      const feedUrl = normaliseFeedUrl(f.feedUrl);
      if (have.has(feedUrl)) {
        duplicates++;
        continue;
      }
      if (room <= 0) {
        skipped++;
        continue;
      }
      have.add(feedUrl);
      room--;
      await ctx.db.insert("graves", {
        userId,
        feedUrl,
        siteUrl: f.siteUrl,
        title: f.title.slice(0, 200) || feedUrl,
        iconUrl: faviconFor(f.siteUrl ?? feedUrl),
        folder: f.folder?.slice(0, 60),
        status: "alive",
        nextFetchAt: now + created * 2_000,
        failureCount: 0,
        unreadCount: 0,
      });
      created++;
    }
    return { created, duplicates, skipped };
  },
});

/** Cron (every 5 min): lease due graves and schedule one fetch each. */
export const pollDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("graves")
      .withIndex("by_nextFetch", (q) => q.lte("nextFetchAt", now))
      .take(50); // 50 feeds per 5 minutes = 600 per hour; raise when needed
    for (const [i, g] of due.entries()) {
      // Lease: push nextFetchAt forward so a slow or crashed fetch is not picked up twice.
      await ctx.db.patch(g._id, { nextFetchAt: now + 15 * MIN });
      await ctx.scheduler.runAfter(i * 300, internal.feedsNode.fetchOne, { graveId: g._id });
    }
    return due.length;
  },
});

export const recordSuccess = internalMutation({
  args: {
    graveId: v.id("graves"),
    notModified: v.boolean(),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    format: v.optional(v.string()),
    title: v.optional(v.string()),
    newFeedUrl: v.optional(v.string()), // set after a permanent redirect
  },
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.graveId);
    if (!g) return null; // laid to rest while fetching
    const now = Date.now();
    const next = afterSuccess(now, g.lastNewItemAt);
    const patch: Partial<Doc<"graves">> = {
      status: next.status,
      nextFetchAt: next.nextFetchAt,
      lastFetchedAt: now,
      failureCount: 0,
      lastErrorCode: undefined,
      lastErrorDetail: undefined,
      doctorNote: undefined,
      doctorNoteFor: undefined,
    };
    if (!a.notModified) {
      patch.etag = a.etag;
      patch.lastModified = a.lastModified;
      if (a.format) patch.format = a.format;
      // OPML imports start with the OPML title; adopt the feed's real title once (customTitle still wins in the UI).
      if (a.title && !g.lastFetchedAt) patch.title = a.title.slice(0, 200);
    }
    if (a.newFeedUrl && a.newFeedUrl !== g.feedUrl) {
      const clash = await ctx.db
        .query("graves")
        .withIndex("by_user_feedUrl", (q) => q.eq("userId", g.userId).eq("feedUrl", a.newFeedUrl!))
        .first();
      if (!clash) patch.feedUrl = a.newFeedUrl;
    }
    await ctx.db.patch(a.graveId, patch);
    return next.status;
  },
});

export const recordFailure = internalMutation({
  args: { graveId: v.id("graves"), code: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, { graveId, code, detail }) => {
    const g = await ctx.db.get(graveId);
    if (!g) return null;
    const failureCount = g.failureCount + 1;
    const next = afterFailure(Date.now(), failureCount, code, g.status);
    await ctx.db.patch(graveId, {
      failureCount,
      status: next.status,
      nextFetchAt: next.nextFetchAt,
      lastFetchedAt: Date.now(),
      lastErrorCode: code,
      lastErrorDetail: detail?.slice(0, 500),
    });
    return next.status;
  },
});

/** Feed Doctor fix / manual retry: new URL (optional), reset failures, poll now. */
export const resetForRetry = internalMutation({
  args: { graveId: v.id("graves"), feedUrl: v.optional(v.string()) },
  handler: async (ctx, { graveId, feedUrl }) => {
    const g = await ctx.db.get(graveId);
    if (!g) return;
    await ctx.db.patch(graveId, {
      ...(feedUrl ? { feedUrl, etag: undefined, lastModified: undefined } : {}),
      failureCount: 0,
      nextFetchAt: Date.now(),
    });
  },
});

/** Batched cleanup after a grave is deleted: items plus their Séances and drafts. */
export const deleteGraveData = internalMutation({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_grave_published", (q) => q.eq("graveId", graveId))
      .take(100);
    for (const item of items) {
      for (const s of await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", item._id)).collect()) {
        await ctx.db.delete(s._id);
      }
      for (const d of await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", item._id)).collect()) {
        await ctx.db.delete(d._id);
      }
      await unindexItem(ctx, item._id);
      await unmatchItem(ctx, item._id);
      await ctx.db.delete(item._id);
    }
    if (items.length === 100) await ctx.scheduler.runAfter(0, internal.graves.deleteGraveData, { graveId });
  },
});
