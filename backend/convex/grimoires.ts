// Grimoire: weekly newsletter drafts (spec .kiro/specs/grimoire). Scoped to one user.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { pickGrimoire, refFor, type GrimoireCandidate } from "../lib/ai/grimoire";

const DAY = 86_400_000;
const MAX_MARKDOWN = 20_000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("grimoires").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(30);
    return rows.map((g) => ({ _id: g._id, weekOf: g.weekOf, title: g.title, itemCount: g.itemIds.length, ghost: g.model.startsWith("ghost:"), updatedAt: g.updatedAt }));
  },
});

export const get = query({
  args: { grimoireId: v.id("grimoires") },
  handler: async (ctx, { grimoireId }) => {
    const user = await requireUser(ctx);
    const g = await requireOwned(ctx, user._id, grimoireId);
    return { _id: g._id, weekOf: g.weekOf, title: g.title, markdown: g.markdown, ghost: g.model.startsWith("ghost:"), updatedAt: g.updatedAt };
  },
});

export const update = mutation({
  args: { grimoireId: v.id("grimoires"), markdown: v.string() },
  handler: async (ctx, { grimoireId, markdown }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, grimoireId);
    if (markdown.length > MAX_MARKDOWN) fail("INVALID_INPUT", "That draft is too long.");
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 120) || "Untitled Grimoire";
    await ctx.db.patch(grimoireId, { markdown, title, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { grimoireId: v.id("grimoires") },
  handler: async (ctx, { grimoireId }) => {
    const user = await requireUser(ctx);
    await requireOwned(ctx, user._id, grimoireId);
    await ctx.db.delete(grimoireId);
  },
});

// ---------- internal ----------

/**
 * Candidates from the last `days`: starred, Omen matches and the most relevant, plus recent ones as filler.
 * Returns the picked items (max 7, one per Kindred group) with what the prompt needs, and the user's voice.
 */
export const context = internalQuery({
  args: { userId: v.id("users"), days: v.number() },
  handler: async (ctx, { userId, days }) => {
    const since = Date.now() - Math.min(Math.max(days, 1), 14) * DAY;
    const byId = new Map<Id<"items">, Doc<"items">>();
    const omenIds = new Set<Id<"items">>();

    const starred = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", userId).eq("isStarred", true).gte("publishedAt", since)).order("desc").take(30);
    for (const i of starred) byId.set(i._id, i);
    const matches = await ctx.db.query("omenMatches").withIndex("by_user_created", (q) => q.eq("userId", userId).gte("createdAt", since)).order("desc").take(30);
    for (const m of matches) {
      const i = byId.get(m.itemId) ?? (await ctx.db.get(m.itemId));
      if (i && i.userId === userId) {
        byId.set(i._id, i);
        omenIds.add(i._id);
      }
    }
    const relevant = await ctx.db.query("items").withIndex("by_user_score", (q) => q.eq("userId", userId)).order("desc").take(60);
    for (const i of relevant) if (i.publishedAt >= since && i.score !== undefined) byId.set(i._id, i);
    if (byId.size < 3) {
      const recent = await ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", userId).gte("publishedAt", since)).order("desc").take(20);
      for (const i of recent) byId.set(i._id, i);
    }

    const candidates: (GrimoireCandidate & { doc: Doc<"items"> })[] = [...byId.values()].map((i) => ({
      id: i._id,
      kindredId: i.kindredId,
      starred: i.isStarred,
      omen: omenIds.has(i._id),
      score: i.score,
      publishedAt: i.publishedAt,
      doc: i,
    }));
    const picked = pickGrimoire(candidates);

    const items = [];
    for (const [n, c] of picked.entries()) {
      const g = await ctx.db.get(c.doc.graveId);
      const seance = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", c.doc._id)).first();
      items.push({
        ref: refFor(n),
        itemId: c.doc._id,
        title: c.doc.title,
        link: c.doc.link ?? g?.siteUrl ?? "",
        source: g ? (g.customTitle ?? g.title) : "",
        points: seance?.summary ?? (c.doc.excerpt ? [c.doc.excerpt] : []),
      });
    }
    const voice = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return {
      items,
      voice: voice ? { tone: voice.tone, audience: voice.audience, wordsToUse: voice.wordsToUse, wordsToAvoid: voice.wordsToAvoid, samplePosts: voice.samplePosts } : null,
    };
  },
});

export const save = internalMutation({
  args: { userId: v.id("users"), weekOf: v.string(), title: v.string(), markdown: v.string(), itemIds: v.array(v.id("items")), model: v.string() },
  handler: async (ctx, a): Promise<Id<"grimoires">> => {
    for (const id of a.itemIds) await requireOwned(ctx, a.userId, id);
    return await ctx.db.insert("grimoires", { ...a, title: a.title.slice(0, 120), markdown: a.markdown.slice(0, MAX_MARKDOWN), updatedAt: Date.now() });
  },
});
