import { internalQuery } from "./_generated/server";
import { utcDay } from "./lib/auth";
import { breakerSnapshot } from "./providerHealth";

/**
 * Pre-demo health check (Final Draft 8.7). Internal: run it from the dashboard or
 *   bunx convex run admin:health
 * Shows breaker states, provider budget use, today's AI calls by provider, Ghost share
 * of today's Séances, and broken feeds. Bounded reads only.
 */
export const health = internalQuery({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const breakers = await breakerSnapshot(ctx);

    const day = utcDay();
    const since = Date.now() - 86_400_000;
    const recentSeances = await ctx.db.query("seances").order("desc").take(500);
    const today = recentSeances.filter((s) => s._creationTime >= since);
    const byModel: Record<string, number> = {};
    for (const s of today) {
      const provider = s.model.split(":")[0];
      byModel[provider] = (byModel[provider] ?? 0) + 1;
    }
    const ghost = byModel.ghost ?? 0;

    const brokenGraves = (await ctx.db.query("graves").withIndex("by_nextFetch").order("desc").take(2000)).filter((g) => g.status === "broken").length;
    const dueNow = (await ctx.db.query("graves").withIndex("by_nextFetch", (q) => q.lte("nextFetchAt", Date.now())).take(1000)).length;

    return {
      day,
      breakers,
      seancesLast24h: today.length,
      seancesByProvider: byModel,
      ghostRate: today.length ? Math.round((ghost / today.length) * 1000) / 10 + "%" : "n/a",
      brokenGraves,
      gravesDueNow: dueNow,
    };
  },
});
