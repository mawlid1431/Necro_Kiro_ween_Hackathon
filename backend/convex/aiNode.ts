"use node";
// AI actions: Séance (summary + relevance score) and Resurrect (social drafts).
// Flow: owner-checked context -> cache -> daily reservation -> the degradation ladder
// (rung 1..n via runWithLadder, Zod + one repair per rung) -> Ghost mode if every rung fails.
// A Séance always returns something; the user never sees an AI error.
import { ConvexError, v } from "convex/values";
import { generateText } from "ai";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SeanceView } from "./seances";
import type { DraftView } from "./drafts";
import { convexDeps, ladderObject } from "./lib/ladder";
import { htmlToText } from "../lib/feeds/normalize";
import { AllRungsFailed, chainFor, runWithLadder, type AiTask } from "../lib/ai/router";
import { ghostResurrect, ghostSeance } from "../lib/ai/ghost";
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
} from "../lib/ai/prompts";

function isLimit(err: unknown): boolean {
  return err instanceof ConvexError && (err.data as { code?: string })?.code === "LIMIT";
}

/**
 * @param retry  re-run the ladder when the cached Séance is a Ghost one ("try again" button)
 */
export async function seanceFor(ctx: ActionCtx, userId: Id<"users">, itemId: Id<"items">, retry = false): Promise<SeanceView> {
  const { item, interests, language, cached } = await ctx.runQuery(internal.seances.context, { userId, itemId });
  if (cached && !(retry && cached.ghost)) return cached; // one model Séance per item, ever

  const text = htmlToText(item.contentHtml) || item.excerpt;
  const ghost = async () => {
    if (cached) return cached; // a retry that fails keeps the existing Ghost Séance
    const g = ghostSeance({ title: item.title, text, interests });
    return await ctx.runMutation(internal.seances.save, { userId, itemId, ...g, inputTokens: 0, outputTokens: 0 });
  };

  let usageId: Id<"aiUsage">;
  try {
    usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "seance" });
  } catch (err) {
    if (isLimit(err)) return await ghost(); // over today's limit: Ghost answers instead of an error
    throw err;
  }

  try {
    const { out, spec } = await ladderObject(ctx, "seance", {
      system: SEANCE_SYSTEM,
      prompt: seancePrompt({ interests, title: item.title, text, language }),
      schema: SeanceSchema,
      maxOutputTokens: 400,
    }, { userId });
    return await ctx.runMutation(internal.seances.save, {
      userId,
      itemId,
      usageId,
      ...out.output,
      model: spec,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
    });
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId }); // Ghost answers do not use quota
    if (err instanceof AllRungsFailed) return await ghost();
    throw err;
  }
}

export async function resurrectFor(ctx: ActionCtx, userId: Id<"users">, itemId: Id<"items">): Promise<DraftView[]> {
  const c = await ctx.runQuery(internal.drafts.context, { userId, itemId });
  // Resurrect builds on the Séance; holding one here uses one Séance from today's limit (or is a Ghost one).
  const summary = c.summary ?? (await seanceFor(ctx, userId, itemId)).summary;
  const link = c.item.link;

  const usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "resurrect" }); // LIMIT is shown to the user
  try {
    const text = htmlToText(c.item.contentHtml) || c.item.excerpt;
    // Private task: the router drops rungs that may train on prompts (voice samples never reach them).
    const { out, spec } = await ladderObject(ctx, "resurrect", {
      system: RESURRECT_SYSTEM,
      prompt: resurrectPrompt({ voice: c.voice, title: c.item.title, link, source: c.source, summary, text }),
      schema: ResurrectSchema,
      maxOutputTokens: 1200,
    }, { userId });
    const o = out.output;
    const hashtags = cleanHashtags(o.hashtags).slice(0, 6);
    return await ctx.runMutation(internal.drafts.replaceForItem, {
      userId,
      itemId,
      usageId,
      model: spec,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      drafts: [
        { platform: "linkedin", text: fitTo(o.linkedin, PLATFORM_LIMITS.linkedin), hashtags },
        // X must fit 280 including the link: trim at a word boundary instead of failing.
        { platform: "x", text: fitTo(o.x, PLATFORM_LIMITS.x, link), hashtags: [] },
        { platform: "instagram", text: fitTo(o.instagram, PLATFORM_LIMITS.instagram), hashtags },
      ],
    });
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId });
    if (!(err instanceof AllRungsFailed)) throw err;
    const g = ghostResurrect({ title: c.item.title, link, summary, interests: c.interests });
    return await ctx.runMutation(internal.drafts.replaceForItem, {
      userId,
      itemId,
      model: g.model,
      inputTokens: 0,
      outputTokens: 0,
      drafts: [
        { platform: "linkedin", text: g.linkedin, hashtags: g.hashtags },
        { platform: "x", text: g.x, hashtags: [] },
        { platform: "instagram", text: g.instagram, hashtags: g.hashtags },
      ],
    });
  }
}

export const holdSeance = action({
  args: { itemId: v.id("items"), retry: v.optional(v.boolean()) },
  handler: async (ctx, { itemId, retry }): Promise<SeanceView> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await seanceFor(ctx, userId, itemId, retry ?? false);
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

/**
 * Ops check: walks every task's chain through the real ladder (breakers and budgets included)
 * and reports which rung answered. `bunx convex run aiNode:healthCheck`
 */
export const healthCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, unknown> = {};
    for (const task of ["seance", "resurrect", "doctor", "briefing", "ask"] as AiTask[]) {
      const chain = chainFor(task);
      if (!chain.length) {
        out[task] = { ok: false, error: `AI_CHAIN_${task.toUpperCase()} is not set` };
        continue;
      }
      try {
        const r = await runWithLadder(task, convexDeps(ctx), (rung) =>
          generateText({ model: rung.model, prompt: "Reply with the single word: risen", maxOutputTokens: 20, maxRetries: 0, abortSignal: AbortSignal.timeout(12_000) }),
        );
        out[task] = { ok: true, model: r.spec, rung: r.rung, ms: r.ms, chain };
      } catch (err) {
        out[task] = err instanceof AllRungsFailed ? { ok: false, chain, attempts: err.attempts } : { ok: false, error: String(err).slice(0, 200) };
      }
    }
    return out;
  },
});
