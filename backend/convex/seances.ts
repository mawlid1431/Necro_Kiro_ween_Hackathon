import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireOwned } from "./lib/auth";

/** `model` is "ghost:extractive" when no AI model answered; the UI labels it "summary without AI". */
export type SeanceView = { summary: string[]; score: number; reason: string; model: string; ghost: boolean };

export const isGhost = (model: string) => model.startsWith("ghost:");

/** Everything holdSeance needs, owner-checked. `cached` short-circuits the AI call. */
export const context = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: async (ctx, { userId, itemId }) => {
    const item = await requireOwned(ctx, userId, itemId);
    const user = await ctx.db.get(userId);
    const existing = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", itemId)).first();
    return {
      item: { title: item.title, contentHtml: item.fullHtml ?? item.contentHtml, excerpt: item.excerpt },
      interests: user?.interests ?? [],
      language: user?.summaryLanguage,
      cached: existing
        ? ({ summary: existing.summary, score: existing.score, reason: existing.reason, model: existing.model, ghost: isGhost(existing.model) } satisfies SeanceView)
        : null,
    };
  },
});

/**
 * Saves the Séance, copies the score onto the item and finalises the usage row (if any).
 * Idempotent: a model Séance is kept forever; a Ghost Séance may be replaced by a model one ("try again").
 */
export const save = internalMutation({
  args: {
    userId: v.id("users"),
    itemId: v.id("items"),
    usageId: v.optional(v.id("aiUsage")),
    summary: v.array(v.string()),
    score: v.number(),
    reason: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, a): Promise<SeanceView> => {
    await requireOwned(ctx, a.userId, a.itemId);
    if (a.usageId && (await ctx.db.get(a.usageId))) {
      await ctx.db.patch(a.usageId, { model: a.model, inputTokens: a.inputTokens, outputTokens: a.outputTokens });
    }
    const view: SeanceView = { summary: a.summary, score: a.score, reason: a.reason, model: a.model, ghost: isGhost(a.model) };
    const existing = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", a.itemId)).first();
    if (existing) {
      const upgrade = isGhost(existing.model) && !isGhost(a.model);
      if (!upgrade) {
        return { summary: existing.summary, score: existing.score, reason: existing.reason, model: existing.model, ghost: isGhost(existing.model) };
      }
      await ctx.db.patch(existing._id, { summary: a.summary, score: a.score, reason: a.reason, model: a.model });
    } else {
      await ctx.db.insert("seances", { userId: a.userId, itemId: a.itemId, summary: a.summary, score: a.score, reason: a.reason, model: a.model });
    }
    await ctx.db.patch(a.itemId, { score: a.score });
    return view;
  },
});
