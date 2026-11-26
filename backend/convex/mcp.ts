// Talk to the Dead: the Convex side of the MCP server (frontend/app/api/mcp/route.ts).
// These functions are public (the Next.js route calls them over HTTP), so EVERY one checks
// MCP_SERVER_SECRET and then filters by the userId that `authenticate` resolved from an API key.
// Outputs stay small: titles, feeds, scores, bullets and capped plain text, never HTML.
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertSecret, fail, requireOwned, utcDay } from "./lib/auth";
import { hitLimit } from "./rateLimits";
import { itemFilter, listFor, searchFor } from "./items";
import { matchesFor } from "./omens";
import { diagnose } from "../lib/errors";
import { htmlToPlain } from "../lib/text";
import { MCP_CALLS_PER_MINUTE } from "../lib/limits";
import type { SeanceView } from "./seances";
import type { AskResult } from "./askNode";
import { activityFor, overviewFor } from "./dashboard";
import { byUserPlatform, modeFor } from "./social";
import { credsFor } from "../lib/social/providers";
import { SOCIAL_PLATFORMS } from "../lib/social/post";
import { zoned } from "../lib/social/time";

const guard = { secret: v.string(), userId: v.id("users") };
const UNTRUSTED = "untrusted web content";

async function checkUser(ctx: QueryCtx, secret: string, userId: Id<"users">) {
  assertSecret(secret, "MCP_SERVER_SECRET");
  if (!(await ctx.db.get(userId))) fail("NOT_FOUND", "Unknown user.");
}

/** Resolves an API key hash to a user, enforces 60 calls a minute, updates lastUsedAt. */
export const authenticate = mutation({
  args: { hash: v.string(), secret: v.string() },
  handler: async (ctx, { hash, secret }) => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false as const, status: 401 };
    const key = await ctx.db.query("apiKeys").withIndex("by_hash", (q) => q.eq("hash", hash)).unique();
    if (!key || key.revokedAt) return { ok: false as const, status: 401 };
    if (key.expiresAt && key.expiresAt <= Date.now()) return { ok: false as const, status: 401 };
    if (!(await hitLimit(ctx, `mcp:${key._id}`, MCP_CALLS_PER_MINUTE, 60_000))) return { ok: false as const, status: 429 };
    const now = Date.now();
    if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) await ctx.db.patch(key._id, { lastUsedAt: now });
    const day = utcDay(now);
    const today = await ctx.db.query("mcpUsage").withIndex("by_key_day", (q) => q.eq("keyId", key._id).eq("day", day)).unique();
    if (today) await ctx.db.patch(today._id, { calls: today.calls + 1 });
    else await ctx.db.insert("mcpUsage", { userId: key.userId, keyId: key._id, day, calls: 1 });
    return { ok: true as const, userId: key.userId, prefix: key.prefix, keyId: key._id, scope: key.scope ?? ("read" as const) };
  },
});

export const listGraves = query({
  args: guard,
  handler: async (ctx, { secret, userId }) => {
    await checkUser(ctx, secret, userId);
    const rows = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(300);
    return rows.map((g) => ({ id: g._id, title: g.customTitle ?? g.title, feedUrl: g.feedUrl, status: g.status, unreadCount: g.unreadCount, folder: g.folder ?? null }));
  },
});

export const getGrave = query({
  args: { ...guard, graveId: v.id("graves") },
  handler: async (ctx, { secret, userId, graveId }) => {
    await checkUser(ctx, secret, userId);
    const g = await requireOwned(ctx, userId, graveId);
    return {
      id: g._id,
      title: g.customTitle ?? g.title,
      feedUrl: g.feedUrl,
      siteUrl: g.siteUrl ?? null,
      status: g.status,
      unreadCount: g.unreadCount,
      lastFetchedAt: g.lastFetchedAt ?? null,
      lastNewItemAt: g.lastNewItemAt ?? null,
      lastError: g.lastErrorCode ? { code: g.lastErrorCode, diagnosis: diagnose(g.lastErrorCode) } : null,
    };
  },
});

export const listItems = query({
  args: { ...guard, graveId: v.optional(v.id("graves")), filter: itemFilter, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { secret, userId, graveId, filter, paginationOpts }) => {
    await checkUser(ctx, secret, userId);
    const page = await listFor(ctx, userId, { graveId, filter, paginationOpts: { ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 50) } });
    return {
      items: page.page.map((i) => ({ id: i._id, title: i.title, feed: i.graveTitle ?? null, publishedAt: new Date(i.publishedAt).toISOString(), score: i.score ?? null, isRead: i.isRead, source: UNTRUSTED })),
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const getItem = query({
  args: { ...guard, itemId: v.id("items") },
  handler: async (ctx, { secret, userId, itemId }) => {
    await checkUser(ctx, secret, userId);
    const i = await requireOwned(ctx, userId, itemId);
    const grave = await ctx.db.get(i.graveId);
    return {
      id: i._id,
      title: i.title,
      feed: grave ? (grave.customTitle ?? grave.title) : null,
      link: i.link ?? null,
      author: i.author ?? null,
      publishedAt: new Date(i.publishedAt).toISOString(),
      text: htmlToPlain(i.fullHtml ?? i.contentHtml, 8000) || i.excerpt,
      source: UNTRUSTED,
    };
  },
});

export const searchItems = query({
  args: { ...guard, query: v.string(), limit: v.number() },
  handler: async (ctx, { secret, userId, query: text, limit }) => {
    await checkUser(ctx, secret, userId);
    const rows = await searchFor(ctx, userId, text, limit);
    return rows.map((i) => ({ id: i._id, title: i.title, feed: i.graveTitle ?? null, publishedAt: new Date(i.publishedAt).toISOString(), score: i.score ?? null, isRead: i.isRead, source: UNTRUSTED }));
  },
});

export const getStats = query({
  args: guard,
  handler: async (ctx, { secret, userId }) => {
    await checkUser(ctx, secret, userId);
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(300);
    const starred = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", userId).eq("isStarred", true)).take(101);
    const seancesToday = await ctx.db
      .query("aiUsage")
      .withIndex("by_user_day_task", (q) => q.eq("userId", userId).eq("day", utcDay()).eq("task", "seance"))
      .take(1000);
    return {
      feeds: graves.length,
      unread: graves.reduce((n, g) => n + g.unreadCount, 0),
      starred: starred.length > 100 ? "100+" : starred.length,
      seancesToday: seancesToday.length,
      brokenFeeds: graves.filter((g) => g.status === "broken").length,
      sleepingFeeds: graves.filter((g) => g.status === "dormant").length,
    };
  },
});

export const getBriefing = query({
  args: guard,
  handler: async (ctx, { secret, userId }) => {
    await checkUser(ctx, secret, userId);
    const b = await ctx.db.query("briefings").withIndex("by_user_day", (q) => q.eq("userId", userId)).order("desc").first();
    if (!b) return null;
    const picks = [];
    for (const id of b.picks) {
      const item = await ctx.db.get(id);
      if (item && item.userId === userId) picks.push({ id: item._id, title: item.title, link: item.link ?? null });
    }
    return { day: b.day, headline: b.headline, body: b.body, picks, model: b.model, source: UNTRUSTED };
  },
});

export const getOmens = query({
  args: { ...guard, limit: v.number() },
  handler: async (ctx, { secret, userId, limit }) => {
    await checkUser(ctx, secret, userId);
    const omens = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", userId)).take(20);
    const matches = await matchesFor(ctx, userId, Math.min(Math.max(limit, 1), 30));
    return {
      omens: omens.map((o) => ({ id: o._id, topic: o.topic, strict: o.strict, muted: o.muted, matchCount: o.matchCount })),
      matches: matches.map((m) => ({ id: m.itemId, topic: m.topic, title: m.title, feed: m.graveTitle, link: m.link, reason: m.reason, via: m.via, source: UNTRUSTED })),
    };
  },
});

export const listKindred = query({
  args: { ...guard, limit: v.number() },
  handler: async (ctx, { secret, userId, limit }) => {
    await checkUser(ctx, secret, userId);
    const recent = await ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", userId)).order("desc").take(200);
    const groups = new Map<string, typeof recent>();
    for (const i of recent) if (i.kindredId) groups.set(i.kindredId, [...(groups.get(i.kindredId) ?? []), i]);
    const out = [];
    for (const [kindredId, items] of groups) {
      if (items.length < 2) continue;
      const feeds = [];
      for (const id of new Set(items.map((i) => i.graveId))) {
        const g = await ctx.db.get(id);
        if (g) feeds.push(g.customTitle ?? g.title);
      }
      out.push({ kindredId, title: items[0].title, feeds, items: items.map((i) => ({ id: i._id, title: i.title })), source: UNTRUSTED });
      if (out.length >= Math.min(limit, 20)) break;
    }
    return out;
  },
});

/** get_dashboard: the user's Home overview, live (same function as the Home page), with times in UTC and Singapore. */
export const getDashboard = query({
  args: guard,
  handler: async (ctx, { secret, userId }) => {
    await checkUser(ctx, secret, userId);
    const user = (await ctx.db.get(userId))!;
    const now = Date.now();
    const o = await overviewFor(ctx, user, now);
    const post = (p: (typeof o.upNext)[number]) => ({
      publishId: p._id, platform: p.platform, status: p.status, delivery: p.mode, title: p.title, liveUrl: p.url ?? null, at: zoned(p.at),
    });
    const connected = [];
    for (const platform of SOCIAL_PLATFORMS) {
      const c = await byUserPlatform(ctx, userId, platform);
      // Same wording as Home's "Connected accounts" card: connected, expired, not connected, or coming soon (not set up).
      const status = c ? (c.status === "expired" ? "expired" : "connected") : credsFor(platform) ? "not connected" : "coming soon";
      connected.push({ platform, connected: !!c && c.status === "active", status, account: c && c.status === "active" ? (c.name ?? c.username ?? null) : null, delivery: modeFor(platform, c) });
    }
    return {
      asOf: zoned(now),
      feeds: o.feeds,
      newArticlesToday: o.risenToday,
      posts: o.posts,
      upNext: o.upNext.map(post),
      recentlyPosted: o.recent.map(post),
      readNext: o.readNext.map((i) => ({ id: i._id, title: i.title, feed: i.source, score: i.score, publishedAt: new Date(i.publishedAt).toISOString(), source: UNTRUSTED })),
      connections: connected,
      setup: o.checklist,
      // The Home charts' data (last 14 UTC days, oldest first): the Activity chart and the MCP calls bar chart.
      series: await (async () => {
        const a = await activityFor(ctx, userId, now);
        return { days: a.days, newArticles: a.risen, postsPosted: a.posted, aiToolUses: a.ai, mcpCalls: a.mcp };
      })(),
    };
  },
});

// ---------- actions (they call the same flows as the UI, so limits and caching apply) ----------

export const getSeance = action({
  args: { ...guard, itemId: v.id("items") },
  handler: async (ctx, { secret, userId, itemId }): Promise<SeanceView> => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    return await ctx.runAction(internal.aiNode.holdSeanceInternal, { userId, itemId });
  },
});

export const addGrave = action({
  args: { ...guard, url: v.string(), folder: v.optional(v.string()) },
  handler: async (ctx, { secret, userId, url, folder }): Promise<unknown> => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    if (url.length > 2000) fail("INVALID_INPUT", "That URL is too long.");
    return await ctx.runAction(internal.feedsNode.summonInternal, { userId, url, folder });
  },
});

export const askCrypt = action({
  args: { ...guard, question: v.string() },
  handler: async (ctx, { secret, userId, question }): Promise<AskResult> => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    return await ctx.runAction(internal.askNode.askInternal, { userId, question });
  },
});
