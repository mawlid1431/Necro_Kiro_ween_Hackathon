"use node";
// Ask the Crypt (Final Draft 6.8): answer a question from the user's own items, with citations.
// Retrieval: full-text title search (the vector path joins once embeddings are filled in).
// Private task: the router never sends the question to providers that may train on prompts.
// Ghost answer when every rung fails or the daily limit is used: the matching items, no prose.
import { ConvexError, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ItemCard } from "./items";
import { ladderObject } from "./lib/ladder";
import { AllRungsFailed } from "../lib/ai/router";
import { ASK_SYSTEM, AskSchema, askPrompt, keepCitations } from "../lib/ai/prompts";

export interface AskResult {
  answer: string;
  citations: string[];
  confident: boolean;
  ghost: boolean;
  model: string;
  items: { id: string; title: string; feed?: string; link?: string; publishedAt: number }[];
}

export async function askFor(ctx: ActionCtx, userId: Id<"users">, question: string): Promise<AskResult> {
  const q = question.trim();
  if (q.length < 2 || q.length > 500) throw new ConvexError({ code: "INVALID_INPUT", message: "Ask a question of 2 to 500 characters." });

  const found: ItemCard[] = await ctx.runQuery(internal.items.searchInternal, { userId, query: q, limit: 8 });
  const items = found.map((i) => ({ id: i._id as string, title: i.title, feed: i.graveTitle, link: i.link, publishedAt: i.publishedAt }));
  if (!found.length) {
    return { answer: "Nothing in your graveyard matches that yet.", citations: [], confident: false, ghost: true, model: "ghost:search", items };
  }
  const ghost = (): AskResult => ({
    answer: "Here are the closest matches from your graveyard.",
    citations: items.map((i) => i.id),
    confident: false,
    ghost: true,
    model: "ghost:search",
    items,
  });

  let usageId: Id<"aiUsage">;
  try {
    usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "ask" });
  } catch (err) {
    if (err instanceof ConvexError && (err.data as { code?: string })?.code === "LIMIT") return ghost();
    throw err;
  }

  try {
    const { out, spec } = await ladderObject(ctx, "ask", {
      system: ASK_SYSTEM,
      prompt: askPrompt({ question: q, items: found.map((i) => ({ id: i._id, title: i.title, feed: i.graveTitle ?? "", excerpt: i.excerpt })) }),
      schema: AskSchema,
      maxOutputTokens: 500,
    }, { userId });
    await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
    const citations = keepCitations(out.output.citations, new Set(items.map((i) => i.id)));
    return { answer: out.output.answer, citations, confident: out.output.confident && citations.length > 0, ghost: false, model: spec, items };
  } catch (err) {
    await ctx.runMutation(internal.aiUsage.release, { usageId });
    if (err instanceof AllRungsFailed) return ghost();
    throw err;
  }
}

export const ask = action({
  args: { question: v.string() },
  handler: async (ctx, { question }): Promise<AskResult> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    return await askFor(ctx, userId, question);
  },
});

/** For MCP and the voice agent: the caller already resolved and verified the user. */
export const askInternal = internalAction({
  args: { userId: v.id("users"), question: v.string() },
  handler: (ctx, { userId, question }): Promise<AskResult> => askFor(ctx, userId, question),
});
