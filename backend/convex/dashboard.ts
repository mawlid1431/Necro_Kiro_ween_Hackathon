// Home: one live overview of the signed-in user's own data (feeds, reading, posts, setup).
// Everything is read through indexes that start with the user's id, with caps, so it stays fast for big accounts.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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
    const uid = user._id;
    const server = Date.now();
    const now = args.now !== undefined && Math.abs(args.now - server) < 10 * 60_000 ? args.now : server;

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
  },
});
