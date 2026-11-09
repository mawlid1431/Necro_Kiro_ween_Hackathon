// Omens: topic alerts (spec .kiro/specs/omens). Every function is scoped to one user.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { isOmenCandidate, omenKeywords } from "../lib/ai/omens";
import { MAX_OMENS_PER_USER, OMEN_CHECKS_PER_RUN } from "../lib/limits";

const DAY = 86_400_000;
const FRESH = 7 * DAY;

function cleanTopic(raw: string): string {
  const topic = raw.replace(/\s+/g, " ").trim();
  if (topic.length < 3 || topic.length > 60) fail("INVALID_INPUT", "A topic needs 3 to 60 characters.");
  if (!omenKeywords(topic).length) fail("INVALID_INPUT", "Use at least one meaningful word, like a name or a term.");
  return topic;
}

function omenView(o: Doc<"omens">) {
  return { _id: o._id, topic: o.topic, keywords: o.keywords, strict: o.strict, muted: o.muted, matchCount: o.matchCount, lastMatchAt: o.lastMatchAt };
}

// ---------- public ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_OMENS_PER_USER);
    return rows.map(omenView);
  },
});

export const create = mutation({
  args: { topic: v.string(), strict: v.optional(v.boolean()) },
  handler: async (ctx, { topic, strict }) => {
    const user = await requireUser(ctx);
    const clean = cleanTopic(topic);
    const mine = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_OMENS_PER_USER);
    if (mine.length >= MAX_OMENS_PER_USER) fail("LIMIT", `You can watch up to ${MAX_OMENS_PER_USER} topics.`);
    if (mine.some((o) => o.topic.toLowerCase() === clean.toLowerCase())) fail("DUPLICATE", "You already watch this topic.");
    const omenId = await ctx.db.insert("omens", { userId: user._id, topic: clean, keywords: omenKeywords(clean), strict: strict ?? false, muted: false, matchCount: 0 });
    // Check the last 7 days right away, so a new topic shows what already matches instead of waiting for new posts.
    const recent = await ctx.db
      .query("items")
      .withIndex("by_user_published", (q) => q.eq("userId", user._id).gte("publishedAt", Date.now() - FRESH))
      .order("desc")
      .take(50);
    if (recent.length) await ctx.scheduler.runAfter(0, internal.omensNode.check, { userId: user._id, itemIds: recent.map((r) => r._id) });
    return omenId;
  },
});

export const update = mutation({
  args: { omenId: v.id("omens"), muted: v.optional(v.boolean()), strict: v.optional(v.boolean()) },
  handler: async (ctx, { omenId, muted, strict }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, omenId);
    await ctx.db.patch(omenId, { ...(muted === undefined ? {} : { muted }), ...(strict === undefined ? {} : { strict }) });
  },
});

export const remove = mutation({
  args: { omenId: v.id("omens") },
  handler: async (ctx, { omenId }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, omenId);
    await ctx.db.delete(omenId);
    await ctx.scheduler.runAfter(0, internal.omens.deleteMatches, { omenId });
  },
});

/** Recent matches across all Omens (or one), newest first, with the item card fields the UI needs. */
export const matches = query({
  args: { omenId: v.optional(v.id("omens")) },
  handler: async (ctx, { omenId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    if (omenId) await requireOwned(ctx, user._id, omenId);
    return await matchesFor(ctx, user._id, 50, omenId);
  },
});

export async function matchesFor(ctx: QueryCtx, userId: Id<"users">, limit: number, omenId?: Id<"omens">) {
  const rows = omenId
    ? await ctx.db.query("omenMatches").withIndex("by_omen", (q) => q.eq("omenId", omenId)).order("desc").take(limit)
    : await ctx.db.query("omenMatches").withIndex("by_user_created", (q) => q.eq("userId", userId)).order("desc").take(limit);
  const out = [];
  const omens = new Map<Id<"omens">, string>();
  const graves = new Map<Id<"graves">, string>();
  for (const m of rows) {
    if (m.userId !== userId) continue;
    const item = await ctx.db.get(m.itemId);
    if (!item) continue;
    if (!omens.has(m.omenId)) omens.set(m.omenId, (await ctx.db.get(m.omenId))?.topic ?? "");
    if (!graves.has(item.graveId)) {
      const g = await ctx.db.get(item.graveId);
      graves.set(item.graveId, g ? (g.customTitle ?? g.title) : "");
    }
    out.push({
      _id: m._id,
      omenId: m.omenId,
      topic: omens.get(m.omenId) ?? "",
      itemId: item._id,
      title: item.title,
      link: item.link ?? null,
      graveTitle: graves.get(item.graveId) ?? "",
      publishedAt: item.publishedAt,
      reason: m.reason,
      via: m.via,
      seen: m.seen,
      createdAt: m.createdAt,
    });
  }
  return out;
}

/** Unread match count for the nav badge (capped at 99). */
export const unseenCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    return (await ctx.db.query("omenMatches").withIndex("by_user_seen", (q) => q.eq("userId", user._id).eq("seen", false)).take(99)).length;
  },
});

export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("omenMatches").withIndex("by_user_seen", (q) => q.eq("userId", user._id).eq("seen", false)).take(200);
    for (const r of rows) await ctx.db.patch(r._id, { seen: true });
  },
});

// ---------- internal ----------

/** Called by items.ingest: schedules a check only if the user watches something and items are fresh. */
export async function scheduleOmenCheck(ctx: MutationCtx, userId: Id<"users">, items: { _id: Id<"items">; publishedAt: number }[]) {
  const now = Date.now();
  const fresh = items.filter((i) => now - i.publishedAt <= FRESH).map((i) => i._id).slice(0, 100);
  if (!fresh.length) return;
  const any = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", userId)).filter((q) => q.eq(q.field("muted"), false)).first();
  if (any) await ctx.scheduler.runAfter(0, internal.omensNode.check, { userId, itemIds: fresh });
}

/** Keyword candidates for a batch of new items: (omen, item) pairs not matched yet. Reads titles and excerpts only. */
export const candidates = internalQuery({
  args: { userId: v.id("users"), itemIds: v.array(v.id("items")) },
  handler: async (ctx, { userId, itemIds }) => {
    const omens = (await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_OMENS_PER_USER)).filter((o) => !o.muted);
    const out: { omenId: Id<"omens">; topic: string; keywords: string[]; strict: boolean; itemId: Id<"items">; title: string; excerpt: string }[] = [];
    for (const id of itemIds) {
      const item = await ctx.db.get(id);
      if (!item || item.userId !== userId) continue;
      for (const o of omens) {
        if (!isOmenCandidate(o.keywords, `${item.title} ${item.excerpt}`)) continue;
        const dup = await ctx.db.query("omenMatches").withIndex("by_omen_item", (q) => q.eq("omenId", o._id).eq("itemId", item._id)).first();
        if (dup) continue;
        out.push({ omenId: o._id, topic: o.topic, keywords: o.keywords, strict: o.strict, itemId: item._id, title: item.title, excerpt: item.excerpt });
        if (out.length >= OMEN_CHECKS_PER_RUN) return out;
      }
    }
    return out;
  },
});

/** Records a match once per (omen, item). Re-checks ownership because it runs from an action. */
export const recordMatch = internalMutation({
  args: { userId: v.id("users"), omenId: v.id("omens"), itemId: v.id("items"), reason: v.string(), via: v.union(v.literal("ai"), v.literal("keyword")) },
  handler: async (ctx, { userId, omenId, itemId, reason, via }) => {
    const omen = await ctx.db.get(omenId);
    const item = await ctx.db.get(itemId);
    if (!omen || !item || omen.userId !== userId || item.userId !== userId) return false;
    const dup = await ctx.db.query("omenMatches").withIndex("by_omen_item", (q) => q.eq("omenId", omenId).eq("itemId", itemId)).first();
    if (dup) return false;
    const now = Date.now();
    await ctx.db.insert("omenMatches", { userId, omenId, itemId, reason: reason.slice(0, 160), via, seen: false, createdAt: now });
    await ctx.db.patch(omenId, { matchCount: omen.matchCount + 1, lastMatchAt: now });
    return true;
  },
});

export const deleteMatches = internalMutation({
  args: { omenId: v.id("omens") },
  handler: async (ctx, { omenId }) => {
    const rows = await ctx.db.query("omenMatches").withIndex("by_omen", (q) => q.eq("omenId", omenId)).take(200);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === 200) await ctx.scheduler.runAfter(0, internal.omens.deleteMatches, { omenId });
  },
});

/** Removes matches that point at a deleted item. */
export async function unmatchItem(ctx: MutationCtx, itemId: Id<"items">) {
  for (const r of await ctx.db.query("omenMatches").withIndex("by_item", (q) => q.eq("itemId", itemId)).take(50)) await ctx.db.delete(r._id);
}
