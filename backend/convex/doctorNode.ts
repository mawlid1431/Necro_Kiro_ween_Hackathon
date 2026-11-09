"use node";
// Feed Doctor actions: retry now, look for a moved feed, and explain an error in plain words.
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ladderObject } from "./lib/ladder";
import { safeFetch } from "../lib/security/ssrf";
import { discoverFeeds } from "../lib/feeds/discover";
import { parseAnyFeed } from "../lib/feeds/any";
import { normaliseFeedUrl } from "../lib/feeds/url";
import { diagnose } from "../lib/errors";
import { DOCTOR_SYSTEM, DoctorSchema, doctorPrompt } from "../lib/ai/prompts";

/** Runs fetchOne now and returns the new status. */
export const retry = action({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }): Promise<{ status: string; inserted: number; diagnosis?: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    await ctx.runQuery(internal.graves.getOwnedInternal, { userId, graveId }); // NOT_FOUND for foreign ids
    const allowed = await ctx.runMutation(internal.rateLimits.hit, { key: `retry:${graveId}`, limit: 6, windowMs: 3_600_000 });
    if (!allowed) throw new ConvexError({ code: "LIMIT", message: "This feed was retried a lot just now. Try again later." });
    const r = await ctx.runAction(internal.feedsNode.fetchOne, { graveId });
    return { status: r.status, inserted: r.inserted, diagnosis: r.code ? diagnose(r.code) : undefined };
  },
});

/** Looks for the feed's new address. Returns a candidate without changing anything. */
export const tryFix = action({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }): Promise<{ candidateUrl: string; title: string; itemCount: number } | null> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const g = await ctx.runQuery(internal.graves.getOwnedInternal, { userId, graveId });
    const allowed = await ctx.runMutation(internal.rateLimits.hit, { key: `fix:${graveId}`, limit: 6, windowMs: 3_600_000 });
    if (!allowed) throw new ConvexError({ code: "LIMIT", message: "Try fix ran a lot just now. Try again later." });

    const origin = new URL(g.feedUrl).origin;
    const starts = [...new Set([g.siteUrl, origin, origin.replace(/^http:/, "https:")].filter((s): s is string => !!s))];
    for (const start of starts) {
      try {
        const found = await discoverFeeds(start, (u) => safeFetch(u));
        for (const f of found.slice(0, 3)) {
          if (normaliseFeedUrl(f.feedUrl) === g.feedUrl) continue;
          const res = await safeFetch(f.feedUrl);
          const feed = parseAnyFeed(res.body, { feedUrl: res.url, fetchedAt: Date.now() });
          return { candidateUrl: res.url, title: feed.title, itemCount: feed.items.length };
        }
      } catch {
        continue; // try the next starting point
      }
    }
    return null;
  },
});

/** One friendly sentence about the current error, cached on the grave until the error changes. */
export const explain = action({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }): Promise<{ note: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const g = await ctx.runQuery(internal.graves.getOwnedInternal, { userId, graveId });
    if (!g.lastErrorCode) return { note: diagnose(undefined) };
    if (g.doctorNote && g.doctorNoteFor === g.lastErrorCode) return { note: g.doctorNote };

    let usageId;
    try {
      usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "doctor" });
    } catch {
      return { note: diagnose(g.lastErrorCode) }; // over today's limit: the static diagnosis answers
    }
    try {
      const { out, spec } = await ladderObject(ctx, "doctor", {
        system: DOCTOR_SYSTEM,
        prompt: doctorPrompt({ code: g.lastErrorCode, detail: g.lastErrorDetail ?? "", feedUrl: g.feedUrl }),
        schema: DoctorSchema,
        maxOutputTokens: 120,
      }, { userId });
      await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
      await ctx.runMutation(internal.doctor.saveNote, { graveId, note: out.output.note, forCode: g.lastErrorCode });
      return { note: out.output.note };
    } catch {
      await ctx.runMutation(internal.aiUsage.release, { usageId });
      return { note: diagnose(g.lastErrorCode) }; // rung 4: the static diagnosis table
    }
  },
});
