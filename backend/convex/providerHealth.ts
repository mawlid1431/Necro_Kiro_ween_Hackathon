import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { isOpen as breakerIsOpen, onFailure, onSuccess, type Breaker } from "../lib/ai/breaker";
import { budgetFor } from "../lib/ai/budgets";

// Circuit breakers and provider budgets for the AI router. Global (per provider), not per user.

export const isOpen = internalQuery({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const row = await ctx.db.query("providerHealth").withIndex("by_provider", (q) => q.eq("provider", provider)).unique();
    return breakerIsOpen(row, Date.now());
  },
});

export const recordResult = internalMutation({
  args: { provider: v.string(), ok: v.boolean(), status: v.optional(v.number()), retryAfterMs: v.optional(v.number()) },
  handler: async (ctx, { provider, ok, status, retryAfterMs }) => {
    const now = Date.now();
    const row = await ctx.db.query("providerHealth").withIndex("by_provider", (q) => q.eq("provider", provider)).unique();
    if (ok && row && row.state === "closed" && row.failures === 0) return; // hot path: nothing to write
    const prev: Breaker | null = row
      ? { state: row.state, failures: row.failures, windowStart: row.windowStart, openedUntil: row.openedUntil, cooldownMs: row.cooldownMs, lastStatus: row.lastStatus }
      : null;
    const next = ok ? onSuccess(now) : onFailure(prev, now, status, retryAfterMs);
    if (!ok && (status === 401 || status === 403)) {
      console.error(JSON.stringify({ ev: "ai_breaker", provider, status, msg: "API key rejected: check the Convex env var" }));
    }
    if (next.state === "open" && row?.state !== "open") {
      console.warn(JSON.stringify({ ev: "ai_breaker", provider, state: "open", until: next.openedUntil, status }));
    }
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("providerHealth", { provider, ...next });
  },
});

/** Counts one call against the provider's per-minute and per-day budget. False = skip this rung. */
export const reserveBudget = internalMutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const { perMinute, perDay } = budgetFor(provider);
    const now = Date.now();
    const windows = [
      { key: `ai:${provider}:m`, start: now - (now % 60_000), limit: perMinute },
      { key: `ai:${provider}:d`, start: now - (now % 86_400_000), limit: perDay },
    ];
    const rows = [];
    for (const w of windows) {
      const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", w.key)).unique();
      if (row && row.windowStart === w.start && row.count >= w.limit) return false; // check both before counting
      rows.push(row);
    }
    for (const [i, w] of windows.entries()) {
      const row = rows[i];
      if (!row) await ctx.db.insert("rateLimits", { key: w.key, windowStart: w.start, count: 1 });
      else await ctx.db.patch(row._id, row.windowStart === w.start ? { count: row.count + 1 } : { windowStart: w.start, count: 1 });
    }
    return true;
  },
});

/** For admin.health: every breaker and today's budget use. */
export const snapshot = internalQuery({ args: {}, handler: (ctx) => breakerSnapshot(ctx) });

export async function breakerSnapshot(ctx: QueryCtx) {
  {
    const now = Date.now();
    const breakers = await ctx.db.query("providerHealth").take(50);
    const out = [];
    for (const b of breakers) {
      const day = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", `ai:${b.provider}:d`)).unique();
      out.push({
        provider: b.provider,
        state: breakerIsOpen(b, now) ? "open" : b.state === "open" ? "half_open" : b.state,
        failures: b.failures,
        lastStatus: b.lastStatus,
        openForMs: Math.max(0, b.openedUntil - now),
        usedToday: day && day.windowStart === now - (now % 86_400_000) ? day.count : 0,
        budgetToday: budgetFor(b.provider).perDay,
      });
    }
    return out;
  }
}
