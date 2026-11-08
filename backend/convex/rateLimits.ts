import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Fixed-window counter stored in Convex (Vercel functions do not share memory).
 * Returns true when the call is allowed and counts it.
 */
export async function hitLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const rl = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (rl && rl.windowStart === windowStart && rl.count >= limit) return false;
  if (rl) await ctx.db.patch(rl._id, rl.windowStart === windowStart ? { count: rl.count + 1 } : { windowStart, count: 1 });
  else await ctx.db.insert("rateLimits", { key, windowStart, count: 1 });
  return true;
}

export const hit = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: (ctx, { key, limit, windowMs }) => hitLimit(ctx, key, limit, windowMs),
});

/** Daily cron: drop windows older than a day. */
export const clearOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("rateLimits")
      .withIndex("by_windowStart", (q) => q.lt("windowStart", Date.now() - 86_400_000))
      .take(1000);
    for (const r of old) await ctx.db.delete(r._id);
  },
});
