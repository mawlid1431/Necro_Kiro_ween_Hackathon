import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { diagnose } from "../lib/errors";
import { normaliseFeedUrl } from "../lib/feeds/url";

const SEVERITY = { broken: 0, failing: 1, dormant: 2 } as const;

/**
 * Feeds that need attention, worst first: broken (3+ failed checks), failing (the last check
 * failed, not yet broken) and sleeping (no new post for 30+ days). Each has a plain-language diagnosis.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const all = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", user._id)).take(300);
    const rows = all
      .map((g) => ({ g, health: g.status === "broken" ? "broken" : g.failureCount > 0 ? "failing" : g.status === "dormant" ? "dormant" : null }))
      .filter((r): r is { g: (typeof all)[number]; health: keyof typeof SEVERITY } => r.health !== null)
      .sort((a, b) => SEVERITY[a.health] - SEVERITY[b.health] || b.g.failureCount - a.g.failureCount);
    return rows.map(({ g, health }) => ({
      health,
      _id: g._id,
      title: g.customTitle ?? g.title,
      feedUrl: g.feedUrl,
      siteUrl: g.siteUrl,
      iconUrl: g.iconUrl,
      status: g.status,
      lastErrorCode: g.lastErrorCode,
      diagnosis: g.status === "dormant" && !g.lastErrorCode ? diagnose(undefined) : diagnose(g.lastErrorCode),
      doctorNote: g.doctorNoteFor === g.lastErrorCode ? g.doctorNote : undefined,
      lastFetchedAt: g.lastFetchedAt,
      lastNewItemAt: g.lastNewItemAt,
      failureCount: g.failureCount,
    }));
  },
});

/**
 * Swaps the feed URL (normally a candidate from doctorNode.tryFix), resets failures and polls now.
 * The poll goes through safeFetch, so a bad candidate simply fails again; it is never fetched unsafely.
 */
export const applyFix = mutation({
  args: { graveId: v.id("graves"), candidateUrl: v.string() },
  handler: async (ctx, { graveId, candidateUrl }) => {
    const user = await requireUser(ctx);
    const g = await requireOwned(ctx, user._id, graveId);
    let url: URL;
    try {
      url = new URL(candidateUrl);
    } catch {
      fail("INVALID_INPUT", "That is not a valid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") fail("INVALID_INPUT", "Only http and https URLs are allowed.");
    const feedUrl = normaliseFeedUrl(url.toString());
    if (feedUrl !== g.feedUrl) {
      const clash = await ctx.db
        .query("graves")
        .withIndex("by_user_feedUrl", (q) => q.eq("userId", user._id).eq("feedUrl", feedUrl))
        .first();
      if (clash) fail("DUPLICATE", "You already follow that feed.");
    }
    await ctx.db.patch(graveId, { feedUrl, etag: undefined, lastModified: undefined, failureCount: 0, nextFetchAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.feedsNode.fetchOne, { graveId });
  },
});

export const saveNote = internalMutation({
  args: { graveId: v.id("graves"), note: v.string(), forCode: v.string() },
  handler: async (ctx, { graveId, note, forCode }) => {
    if (await ctx.db.get(graveId)) await ctx.db.patch(graveId, { doctorNote: note.slice(0, 240), doctorNoteFor: forCode });
  },
});
