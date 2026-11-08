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
import { diagnose } from "../lib/errors";
import { htmlToPlain } from "../lib/text";
import { MCP_CALLS_PER_MINUTE } from "../lib/limits";
import type { SeanceView } from "./seances";
import type { AskResult } from "./askNode";

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
    if (!(await hitLimit(ctx, `mcp:${key._id}`, MCP_CALLS_PER_MINUTE, 60_000))) return { ok: false as const, status: 429 };
    const now = Date.now();
    if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) await ctx.db.patch(key._id, { lastUsedAt: now });
    return { ok: true as const, userId: key.userId, prefix: key.prefix };
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
    const starred = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", userId).eq("isStarred", true)).take(500);
    const seancesToday = await ctx.db
      .query("aiUsage")
      .withIndex("by_user_day_task", (q) => q.eq("userId", userId).eq("day", utcDay()).eq("task", "seance"))
      .take(1000);
    return {
      feeds: graves.length,
      unread: graves.reduce((n, g) => n + g.unreadCount, 0),
      starred: starred.length === 500 ? "500+" : starred.length,
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
