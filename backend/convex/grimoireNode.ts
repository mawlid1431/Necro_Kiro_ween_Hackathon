"use node";
// Grimoire compose: pick the week's best items, write the newsletter with the AI ladder
// (private task "grimoire", in the user's voice), or build a template when no AI answers.
import { ConvexError, v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ladderObject } from "./lib/ladder";
import { utcDay } from "./lib/auth";
import { AllRungsFailed } from "../lib/ai/router";
import { filterSections, ghostGrimoire, renderMarkdown, type GrimoireDraft } from "../lib/ai/grimoire";
import { GRIMOIRE_SYSTEM, GrimoireSchema, grimoirePrompt } from "../lib/ai/prompts";

export async function composeFor(ctx: ActionCtx, userId: Id<"users">, days = 7): Promise<{ grimoireId: Id<"grimoires">; ghost: boolean }> {
  const c = await ctx.runQuery(internal.grimoires.context, { userId, days });
  if (!c.items.length) throw new ConvexError({ code: "INVALID_INPUT", message: "Nothing rose this week yet. Summon a few feeds or star some posts first." });

  // Composing counts toward today's limit whether AI or the template writes it (throws LIMIT when used up).
  const usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "grimoire" });
  const weekOf = utcDay();
  let draft: GrimoireDraft;
  let model: string;
  try {
    const { out, spec } = await ladderObject(ctx, "grimoire", {
      system: GRIMOIRE_SYSTEM,
      prompt: grimoirePrompt({ voice: c.voice, weekOf, items: c.items }),
      schema: GrimoireSchema,
      maxOutputTokens: 1500,
    }, { userId });
    await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
    draft = filterSections(out.output, c.items.map((i) => i.ref));
    model = spec;
    if (!draft.sections.length) throw new AllRungsFailed("grimoire", [{ spec, outcome: "no valid sections" }]);
  } catch (err) {
    if (!(err instanceof AllRungsFailed)) {
      await ctx.runMutation(internal.aiUsage.release, { usageId });
      throw err;
    }
    draft = ghostGrimoire(c.items, weekOf);
    model = "ghost:template";
    await ctx.runMutation(internal.aiUsage.finalize, { usageId, model, inputTokens: 0, outputTokens: 0 });
  }

  const used = new Set(draft.sections.map((s) => s.ref));
  const grimoireId = await ctx.runMutation(internal.grimoires.save, {
    userId,
    weekOf,
    title: draft.title,
    markdown: renderMarkdown(draft, c.items),
    itemIds: c.items.filter((i) => used.has(i.ref)).map((i) => i.itemId),
    model,
  });
  return { grimoireId, ghost: model.startsWith("ghost:") };
}

export const compose = action({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }): Promise<{ grimoireId: Id<"grimoires">; ghost: boolean }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await composeFor(ctx, userId, days ?? 7);
  },
});
