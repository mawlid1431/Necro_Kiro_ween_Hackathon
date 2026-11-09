"use node";
// Second Opinion: compare up to 4 sources of one Kindred group with the AI ladder (task "opinion").
// Without AI (limit reached or every rung down) the sources are shown side by side with their key sentences.
import { ConvexError, v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { OpinionView } from "./opinions";
import { ladderObject } from "./lib/ladder";
import { AllRungsFailed } from "../lib/ai/router";
import { ghostSeance } from "../lib/ai/ghost";
import { filterCitations } from "../lib/ai/opinion";
import { OPINION_SYSTEM, OpinionSchema, opinionPrompt } from "../lib/ai/prompts";

function isLimit(err: unknown): boolean {
  return err instanceof ConvexError && (err.data as { code?: string })?.code === "LIMIT";
}

export async function compareFor(ctx: ActionCtx, userId: Id<"users">, itemId: Id<"items">, retry = false): Promise<OpinionView> {
  const c = await ctx.runQuery(internal.opinions.context, { userId, itemId });
  if (!c) throw new ConvexError({ code: "INVALID_INPUT", message: "This story has no other sources to compare yet." });
  if (c.cached && !(retry && c.cached.ghost)) return c.cached;

  // Key sentences are extractive and free; they make the side-by-side view and back up every mode.
  const sources = c.sources.map((s) => ({
    label: s.label,
    itemId: s.itemId,
    feed: s.feed,
    title: s.title,
    key: ghostSeance({ title: s.title, text: s.text, interests: [] }).summary.slice(0, 2),
  }));
  const base = { userId, kindredId: c.kindredId, itemIds: c.itemIds, sources };
  const ghost = async () => c.cached ?? (await ctx.runMutation(internal.opinions.save, { ...base, agree: [], differ: [], onlyOne: [], model: "ghost:side-by-side" }));

  let usageId: Id<"aiUsage">;
  try {
    usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "opinion" });
  } catch (err) {
    if (isLimit(err)) return await ghost();
    throw err;
  }

  try {
    const { out, spec } = await ladderObject(ctx, "opinion", {
      system: OPINION_SYSTEM,
      prompt: opinionPrompt(c.sources),
      schema: OpinionSchema,
      maxOutputTokens: 900,
    }, { userId });
    await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
    const clean = filterCitations(out.output, sources.map((s) => s.label));
    return await ctx.runMutation(internal.opinions.save, { ...base, ...clean, model: spec });
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId });
    if (err instanceof AllRungsFailed) return await ghost();
    throw err;
  }
}

export const compare = action({
  args: { itemId: v.id("items"), retry: v.optional(v.boolean()) },
  handler: async (ctx, { itemId, retry }): Promise<OpinionView> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await compareFor(ctx, userId, itemId, retry ?? false);
  },
});
