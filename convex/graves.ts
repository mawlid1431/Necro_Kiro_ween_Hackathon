import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser, getOwned, requireUser } from "./lib/auth";

/** The caller's feeds, for the Graveyard. Signed-out callers get an empty list. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("graves")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const get = query({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }) => {
    const user = await requireUser(ctx);
    return await getOwned(ctx, user, graveId);
  },
});
