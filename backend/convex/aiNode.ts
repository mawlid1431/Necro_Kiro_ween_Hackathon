"use node";
// AI actions: Séance (summary + relevance score) and Resurrect (social drafts).
// Flow: owner-checked context -> cache -> atomic daily reservation -> model via withFallback
// -> Zod-validated output -> save + finalise usage. A failure releases the reservation.
import { ConvexError, v } from "convex/values";
import { generateText, Output } from "ai";
import { z } from "zod";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SeanceView } from "./seances";
import type { DraftView } from "./drafts";
import { withFallback } from "../lib/ai";
import { htmlToText } from "../lib/feeds/normalize";
import {
  cleanHashtags,
  fitTo,
  PLATFORM_LIMITS,
  RESURRECT_SYSTEM,
  ResurrectSchema,
  resurrectPrompt,
  SEANCE_SYSTEM,
  SeanceSchema,
  seancePrompt,
} from "../lib/prompts";

function aiUnavailable(err: unknown): ConvexError<{ code: string; message: string }> {
  if (err instanceof ConvexError) return err;
  return new ConvexError({ code: "AI_UNAVAILABLE", message: "The spirits are quiet right now. Try again in a minute." });
}

export async function seanceFor(ctx: ActionCtx, userId: Id<"users">, itemId: Id<"items">): Promise<SeanceView> {
  const { item, interests, cached } = await ctx.runQuery(internal.seances.context, { userId, itemId });
  if (cached) return cached; // one Séance per item, ever

  const usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "seance" }); // throws LIMIT
  try {
    const text = htmlToText(item.contentHtml) || item.excerpt;
    const { result, spec } = await withFallback("seance", ({ model }) =>
      generateText({
        model,
        system: SEANCE_SYSTEM,
        prompt: seancePrompt({ interests, title: item.title, text }),
        output: Output.object({ schema: SeanceSchema }),
        maxOutputTokens: 400,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(20_000),
      }),
    );
    return await ctx.runMutation(internal.seances.save, {
      userId,
      itemId,
      usageId,
      ...result.output,
      model: spec,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    });
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId });
    throw aiUnavailable(err);
  }
}

export async function resurrectFor(ctx: ActionCtx, userId: Id<"users">, itemId: Id<"items">): Promise<DraftView[]> {
  const c = await ctx.runQuery(internal.drafts.context, { userId, itemId });
  // Resurrect builds on the Séance; holding one here uses one Séance from today's limit.
  const summary = c.summary ?? (await seanceFor(ctx, userId, itemId)).summary;

  const usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "resurrect" });
  try {
    const text = htmlToText(c.item.contentHtml) || c.item.excerpt;
    const { result, spec } = await withFallback("resurrect", ({ model }) =>
      generateText({
        model,
        system: RESURRECT_SYSTEM,
        prompt: resurrectPrompt({ voice: c.voice, title: c.item.title, link: c.item.link, source: c.source, summary, text }),
        output: Output.object({ schema: ResurrectSchema }),
        maxOutputTokens: 1200,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
      }),
    );
    const o = result.output;
    const hashtags = cleanHashtags(o.hashtags).slice(0, 6);
    return await ctx.runMutation(internal.drafts.replaceForItem, {
      userId,
      itemId,
      usageId,
      model: spec,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      drafts: [
        { platform: "linkedin", text: fitTo(o.linkedin, PLATFORM_LIMITS.linkedin), hashtags },
        // X must fit 280 including the link: trim at a word boundary instead of failing.
        { platform: "x", text: fitTo(o.x, PLATFORM_LIMITS.x, c.item.link), hashtags: [] },
        { platform: "instagram", text: fitTo(o.instagram, PLATFORM_LIMITS.instagram), hashtags },
      ],
    });
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId });
    throw aiUnavailable(err);
  }
}

export const holdSeance = action({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }): Promise<SeanceView> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await seanceFor(ctx, userId, itemId);
  },
});

export const raiseResurrect = action({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }): Promise<DraftView[]> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await resurrectFor(ctx, userId, itemId);
  },
});

/** For MCP and the voice agent: the caller already resolved and verified the user. */
export const holdSeanceInternal = internalAction({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: (ctx, { userId, itemId }): Promise<SeanceView> => seanceFor(ctx, userId, itemId),
});

/** Ops check: proves each task's model, key and structured output work. `bunx convex run aiNode:healthCheck` */
export const healthCheck = internalAction({
  args: {},
  handler: async () => {
    const out: Record<string, unknown> = {};
    for (const task of ["seance", "resurrect", "doctor"] as const) {
      try {
        const { result, spec, ms, usedFallback } = await withFallback(task, ({ model }) =>
          generateText({
            model,
            prompt: 'Reply with JSON {"status":"ok"}.',
            output: Output.object({ schema: z.object({ status: z.string() }) }),
            maxOutputTokens: 60,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(20_000),
          }),
        );
        out[task] = { ok: true, model: spec, ms, usedFallback, tokens: result.usage.totalTokens };
      } catch (err) {
        out[task] = { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" };
      }
    }
    return out;
  },
});
