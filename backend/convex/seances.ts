import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireOwned } from "./lib/auth";

export type SeanceView = { summary: string[]; score: number; reason: string; model: string };

/** Everything holdSeance needs, owner-checked. `cached` short-circuits the AI call. */
export const context = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: async (ctx, { userId, itemId }) => {
    const item = await requireOwned(ctx, userId, itemId);
    const user = await ctx.db.get(userId);
    const existing = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", itemId)).first();
    return {
      item: { title: item.title, contentHtml: item.contentHtml, excerpt: item.excerpt },
      interests: user?.interests ?? [],
      cached: existing
        ? ({ summary: existing.summary, score: existing.score, reason: existing.reason, model: existing.model } satisfies SeanceView)
        : null,
    };
  },
});

/** Saves the Séance, copies the score onto the item, finalises the usage row. No-op if one exists. */
export const save = internalMutation({
  args: {
    userId: v.id("users"),
    itemId: v.id("items"),
    usageId: v.id("aiUsage"),
    summary: v.array(v.string()),
    score: v.number(),
    reason: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, a): Promise<SeanceView> => {
    await requireOwned(ctx, a.userId, a.itemId);
    await ctx.db.patch(a.usageId, { model: a.model, inputTokens: a.inputTokens, outputTokens: a.outputTokens });
    const existing = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", a.itemId)).first();
    if (existing) {
      return { summary: existing.summary, score: existing.score, reason: existing.reason, model: existing.model };
    }
    await ctx.db.insert("seances", {
      userId: a.userId,
      itemId: a.itemId,
      summary: a.summary,
      score: a.score,
      reason: a.reason,
      model: a.model,
    });
    await ctx.db.patch(a.itemId, { score: a.score });
    return { summary: a.summary, score: a.score, reason: a.reason, model: a.model };
  },
});
