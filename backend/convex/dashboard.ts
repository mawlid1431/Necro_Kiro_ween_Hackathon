// Home: one live overview of the signed-in user's own data (feeds, reading, posts, setup).
// Everything is read through indexes that start with the user's id, with caps, so it stays fast for big accounts.

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { MAX_GRAVES_PER_USER } from "../lib/limits";
import type { SocialPlatform } from "../lib/social/post";

const DAY = 86_400_000;

export type OverviewPost = { _id: Id<"publishes">; platform: SocialPlatform; status: string; at: number; title: string; url?: string; mode: "auto" | "reminder" };

export type Overview = {
  name: string;
  feeds: { total: number; alive: number; sleeping: number; broken: number; unread: number };
  risenToday: number;
  posts: { posted30d: number; scheduled: number; due: number; failed7d: number };
  upNext: OverviewPost[];
  recent: OverviewPost[];
  readNext: { _id: Id<"items">; title: string; source: string; score: number; publishedAt: number }[];
  checklist: { feeds: boolean; interests: boolean; voice: boolean; connected: boolean; firstPost: boolean; mcpKey: boolean };
};

const firstLine = (t?: string) => {
  const line = (t ?? "").trim().split("\n")[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 78)}…` : line;
};

export const overview = query({
  // `now` comes from the page (rounded to the minute and refreshed every minute): Convex re-runs a query when its
  // data changes, not when time passes, so this keeps "rose today", "last 30 days" and "due" sliding forward live.
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Overview | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const server = Date.now();
    return await overviewFor(ctx, user, args.now !== undefined && Math.abs(args.now - server) < 10 * 60_000 ? args.now : server);
  },
});

/** Home's overview for one user. Shared with the MCP get_dashboard tool, so an assistant sees exactly what Home shows. */
export async function overviewFor(ctx: QueryCtx, user: Doc<"users">, now: number): Promise<Overview> {
  {
    const uid = user._id;

    // Feeds
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", uid)).take(MAX_GRAVES_PER_USER);
    const titles = new Map(graves.map((g) => [g._id, g.customTitle ?? g.title]));
    const feeds = {
      total: graves.length,
      alive: graves.filter((g) => g.status === "alive").length,
      sleeping: graves.filter((g) => g.status === "dormant").length,
      broken: graves.filter((g) => g.status === "broken").length,
      unread: graves.reduce((n, g) => n + g.unreadCount, 0),
    };
    const risen = await ctx.db.query("items").withIndex("by_user_risen", (q) => q.eq("userId", uid).gte("risenAt", now - DAY)).take(500);

    // Best to read next: unread, highest Séance relevance first
    const scored = await ctx.db
      .query("items")
      .withIndex("by_user_read_score", (q) => q.eq("userId", uid).eq("isRead", false).gte("score", 0))
      .order("desc")
      .take(3);
    const readNext = scored.map((i) => ({ _id: i._id, title: i.title, source: titles.get(i.graveId) ?? "", score: i.score ?? 0, publishedAt: i.publishedAt }));

    // Posts: last 30 days to 90 days ahead
    const rows = await ctx.db.query("publishes").withIndex("by_user_at", (q) => q.eq("userId", uid).gte("at", now - 30 * DAY).lte("at", now + 90 * DAY)).take(1000);
    const toPost = async (r: (typeof rows)[number]): Promise<OverviewPost> => {
      const item = r.itemId ? await ctx.db.get(r.itemId) : null;
      return { _id: r._id, platform: r.platform, status: r.status, at: r.at ?? r.createdAt, title: item?.title ?? (firstLine(r.text) || "Image post"), url: r.url, mode: r.mode ?? "auto" };
    };
    const pending = rows.filter((r) => r.status === "scheduled" || r.status === "due" || r.status === "posting").sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const done = rows.filter((r) => r.status === "posted").sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const posts = {
      posted30d: done.length,
      scheduled: rows.filter((r) => r.status === "scheduled").length,
      due: rows.filter((r) => r.status === "due").length,
      failed7d: rows.filter((r) => r.status === "failed" && (r.at ?? 0) > now - 7 * DAY).length,
    };

    // Setup checklist (what makes Necro useful), each a cheap indexed lookup
    const [voice, conn, anyPost, key] = await Promise.all([
      ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", uid)).first(),
      ctx.db.query("connections").withIndex("by_user_platform", (q) => q.eq("userId", uid)).first(),
      ctx.db.query("publishes").withIndex("by_user", (q) => q.eq("userId", uid)).first(),
      ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", uid)).first(),
    ]);

    return {
      name: user.displayName ?? user.name?.split(" ")[0] ?? "",
      feeds,
      risenToday: risen.length,
      posts,
      upNext: await Promise.all(pending.slice(0, 3).map(toPost)),
      recent: await Promise.all(done.slice(0, 3).map(toPost)),
      readNext,
      checklist: {
        feeds: graves.length > 0,
        interests: user.interests.length > 0,
        voice: !!voice,
        connected: !!conn,
        firstPost: !!anyPost,
        mcpKey: !!key,
      },
    };
  }
}

export type Activity = {
  /** UTC days, oldest first ("YYYY-MM-DD"). */
  days: string[];
  risen: number[];
  posted: number[];
  ai: number[];
  mcp: number[];
  /** MCP calls per key over the same window. */
  mcpByKey: { keyId: Id<"apiKeys">; calls: number }[];
};

export const ACTIVITY_DAYS = 14;

/** Daily counts for the overview chart: new articles, posts that went out, AI tool uses and MCP calls. Reads only small rows. */
export const activity = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Activity | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const uid = user._id;
    const server = Date.now();
    const now = args.now !== undefined && Math.abs(args.now - server) < 10 * 60_000 ? args.now : server;
    const todayStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const start = todayStart - (ACTIVITY_DAYS - 1) * DAY;
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
    const index = new Map(days.map((d, i) => [d, i]));
    const empty = () => days.map(() => 0);
    const bucket = (t: number) => Math.floor((t - start) / DAY);

    // New articles per day, counted from kindredIndex (one small row per article: title and date) instead of items,
    // whose HTML (up to 200 KB each) pushed big accounts past Convex's per-query read limit.
    const risen = empty();
    for (const i of await ctx.db.query("kindredIndex").withIndex("by_user_published", (q) => q.eq("userId", uid).gte("publishedAt", start).lte("publishedAt", now)).take(5000)) {
      const b = bucket(i.publishedAt);
      if (b >= 0 && b < ACTIVITY_DAYS) risen[b]++;
    }

    const posted = empty();
    for (const p of await ctx.db.query("publishes").withIndex("by_user_at", (q) => q.eq("userId", uid).gte("at", start).lte("at", now)).take(1000)) {
      const b = bucket(p.at ?? p.createdAt);
      if (p.status === "posted" && b >= 0 && b < ACTIVITY_DAYS) posted[b]++;
    }

    const ai = empty();
    for (const u of await ctx.db.query("aiUsage").withIndex("by_user_day_task", (q) => q.eq("userId", uid).gte("day", days[0])).take(3000)) {
      const b = index.get(u.day);
      if (b !== undefined) ai[b]++;
    }

    const mcp = empty();
    const perKey = new Map<Id<"apiKeys">, number>();
    for (const r of await ctx.db.query("mcpUsage").withIndex("by_user_day", (q) => q.eq("userId", uid).gte("day", days[0])).take(1000)) {
      const b = index.get(r.day);
      if (b === undefined) continue;
      mcp[b] += r.calls;
      perKey.set(r.keyId, (perKey.get(r.keyId) ?? 0) + r.calls);
    }

    return { days, risen, posted, ai, mcp, mcpByKey: [...perKey].map(([keyId, calls]) => ({ keyId, calls })) };
  },
});
