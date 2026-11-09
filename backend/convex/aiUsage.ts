import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fail, utcDay } from "./lib/auth";
import { DAILY_AI_LIMITS, VOICE_SECONDS_PER_DAY } from "../lib/limits";

const limitedTask = v.union(v.literal("seance"), v.literal("resurrect"), v.literal("doctor"), v.literal("ask"), v.literal("omen"), v.literal("opinion"));

/**
 * Atomically checks today's count and inserts a pending row, so two fast clicks
 * cannot both pass the limit (Convex mutations are serialisable).
 */
export const reserve = internalMutation({
  args: { userId: v.id("users"), task: limitedTask },
  handler: async (ctx, { userId, task }): Promise<Id<"aiUsage">> => {
    const day = utcDay();
    const limit = DAILY_AI_LIMITS[task];
    const used = await ctx.db
      .query("aiUsage")
      .withIndex("by_user_day_task", (q) => q.eq("userId", userId).eq("day", day).eq("task", task))
      .take(limit);
    if (used.length >= limit) fail("LIMIT", `You have used all ${limit} of today's ${task === "seance" ? "Séances" : task === "resurrect" ? "Resurrects" : task === "ask" ? "questions" : task === "omen" ? "Omen checks" : task === "opinion" ? "Second Opinions" : "Doctor notes"}. They reset at midnight UTC.`);
    return await ctx.db.insert("aiUsage", { userId, task, model: "pending", inputTokens: 0, outputTokens: 0, day });
  },
});

export const finalize = internalMutation({
  args: { usageId: v.id("aiUsage"), model: v.string(), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, { usageId, ...rest }) => {
    if (await ctx.db.get(usageId)) await ctx.db.patch(usageId, rest);
  },
});

/** A failed call must not use up quota. */
export const release = internalMutation({
  args: { usageId: v.id("aiUsage") },
  handler: async (ctx, { usageId }) => {
    if (await ctx.db.get(usageId)) await ctx.db.delete(usageId);
  },
});

export async function usageToday(ctx: QueryCtx, userId: Id<"users">) {
  const day = utcDay();
  const count = async (task: "seance" | "resurrect" | "doctor" | "ask" | "omen" | "opinion") =>
    (
      await ctx.db
        .query("aiUsage")
        .withIndex("by_user_day_task", (q) => q.eq("userId", userId).eq("day", day).eq("task", task))
        .take(DAILY_AI_LIMITS[task])
    ).length;
  const sessions = await ctx.db
    .query("voiceSessions")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .take(500);
  const voiceSeconds = sessions.reduce((n, s) => n + s.seconds, 0);
  return {
    seance: { used: await count("seance"), limit: DAILY_AI_LIMITS.seance },
    resurrect: { used: await count("resurrect"), limit: DAILY_AI_LIMITS.resurrect },
    doctor: { used: await count("doctor"), limit: DAILY_AI_LIMITS.doctor },
    ask: { used: await count("ask"), limit: DAILY_AI_LIMITS.ask },
    omen: { used: await count("omen"), limit: DAILY_AI_LIMITS.omen },
    opinion: { used: await count("opinion"), limit: DAILY_AI_LIMITS.opinion },
    voiceMinutes: { used: Math.ceil(voiceSeconds / 60), limit: VOICE_SECONDS_PER_DAY / 60 },
  };
}

