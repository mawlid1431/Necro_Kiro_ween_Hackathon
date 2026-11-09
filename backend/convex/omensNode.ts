"use node";
// Omen confirmation: keyword candidates are confirmed by the AI ladder (private task "omen").
// When AI is out of quota or unavailable, non-strict Omens keep a labelled keyword match instead.
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ladderObject } from "./lib/ladder";
import { AllRungsFailed } from "../lib/ai/router";
import { keywordReason } from "../lib/ai/omens";
import { OMEN_SYSTEM, OmenSchema, omenPrompt } from "../lib/ai/prompts";

function isLimit(err: unknown): boolean {
  return err instanceof ConvexError && (err.data as { code?: string })?.code === "LIMIT";
}

export const check = internalAction({
  args: { userId: v.id("users"), itemIds: v.array(v.id("items")) },
  handler: async (ctx, { userId, itemIds }): Promise<{ checked: number; matched: number }> => {
    const pairs = await ctx.runQuery(internal.omens.candidates, { userId, itemIds });
    let matched = 0;
    let aiAvailable = true; // after one ladder failure or limit, the rest of this batch uses keywords

    for (const p of pairs) {
      const keyword = async () => {
        if (p.strict) return; // strict Omens only alert on AI-confirmed matches
        if (await ctx.runMutation(internal.omens.recordMatch, { userId, omenId: p.omenId, itemId: p.itemId, reason: keywordReason(p.keywords), via: "keyword" })) matched++;
      };
      if (!aiAvailable) {
        await keyword();
        continue;
      }

      let usageId: Id<"aiUsage">;
      try {
        usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "omen" });
      } catch (err) {
        if (!isLimit(err)) throw err;
        aiAvailable = false;
        await keyword();
        continue;
      }

      try {
        const { out, spec } = await ladderObject(ctx, "omen", {
          system: OMEN_SYSTEM,
          prompt: omenPrompt({ topic: p.topic, title: p.title, text: p.excerpt }),
          schema: OmenSchema,
          maxOutputTokens: 120,
        });
        await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
        if (out.output.match) {
          if (await ctx.runMutation(internal.omens.recordMatch, { userId, omenId: p.omenId, itemId: p.itemId, reason: out.output.reason || `About ${p.topic}`, via: "ai" })) matched++;
        }
      } catch (err) {
        await ctx.runMutation(internal.aiUsage.release, { usageId });
        if (!(err instanceof AllRungsFailed)) throw err;
        aiAvailable = false;
        await keyword();
      }
    }
    return { checked: pairs.length, matched };
  },
});
