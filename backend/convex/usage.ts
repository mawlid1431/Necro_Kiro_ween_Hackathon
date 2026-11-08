import { query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { usageToday } from "./aiUsage";

/** Per-task used and limit for today (UTC), for the usage meter. */
export const today = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await usageToday(ctx, user._id);
  },
});
