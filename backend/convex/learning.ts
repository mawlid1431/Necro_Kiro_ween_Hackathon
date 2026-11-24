// Learning memory (spec .kiro/specs/learning): Necro learns each reader from their own actions, day by day,
// and gives that to the AI as context. Scoped to one user; never shared, shown in Settings, can be switched off or reset.

import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { learnProfile, learnedContext, type Learned, type Signal } from "../lib/ai/learn";

const REFRESH_DELAY_MS = 20_000; // actions within 20 s share one refresh; every action is counted
const STALE_QUEUE_MS = 10 * 60_000; // a queued refresh that never ran (deploy, crash) is retried after this
const PER_KIND = 100;

/**
 * Called after an action that teaches Necro something (star, summary, draft, post). Coalesced: if a refresh is
 * already queued it will see this action too (it reads the latest rows when it runs), so nothing is lost.
 */
export async function scheduleLearn(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const u = await ctx.db.get(userId);
  if (!u || u.learningOff) return;
  const now = Date.now();
  if (u.learnQueuedAt && now - u.learnQueuedAt < STALE_QUEUE_MS) return; // one is queued and has not run yet
  await ctx.db.patch(userId, { learnQueuedAt: now });
  await ctx.scheduler.runAfter(REFRESH_DELAY_MS, internal.learning.refresh, { userId });
}

/** The prompt line for this user, or null (learning off, or not enough activity yet). */
export function learnedLine(u: Doc<"users"> | null): string | null {
  if (!u || u.learningOff) return null;
  return learnedContext(u.learned as Learned | undefined);
}

async function signalsFor(ctx: QueryCtx | MutationCtx, u: Doc<"users">): Promise<Signal[]> {
  const since = u.learnedResetAt ?? 0;
  const grave = new Map<Id<"graves">, string>();
  const feedOf = async (g: Id<"graves">) => {
    if (!grave.has(g)) {
      const d = await ctx.db.get(g);
      grave.set(g, d ? (d.customTitle ?? d.title) : "");
    }
    return grave.get(g) || undefined;
  };
  const out: Signal[] = [];
  const add = async (kind: Signal["kind"], item: Doc<"items"> | null, at: number) => {
    if (!item || at < since) return;
    out.push({ kind, topic: item.topic, title: item.title, feed: await feedOf(item.graveId), at });
  };

  const posted = await ctx.db.query("publishes").withIndex("by_user", (q) => q.eq("userId", u._id)).order("desc").take(PER_KIND);
  for (const p of posted) if (p.status === "posted" && p.itemId) await add("posted", await ctx.db.get(p.itemId), p.finishedAt ?? p.createdAt);
  const drafts = await ctx.db.query("drafts").withIndex("by_user", (q) => q.eq("userId", u._id)).order("desc").take(PER_KIND);
  const draftedItems = new Set<Id<"items">>();
  for (const d of drafts) {
    if (draftedItems.has(d.itemId)) continue; // one Resurrect makes up to 3 drafts: count the article once
    draftedItems.add(d.itemId);
    await add("drafted", await ctx.db.get(d.itemId), d._creationTime);
  }
  const starred = await ctx.db.query("items").withIndex("by_user_starred", (q) => q.eq("userId", u._id).eq("isStarred", true)).order("desc").take(PER_KIND);
  for (const i of starred) await add("starred", i, i.risenAt);
  const seances = await ctx.db.query("seances").withIndex("by_user", (q) => q.eq("userId", u._id)).order("desc").take(PER_KIND * 2);
  for (const s of seances) await add("summarised", await ctx.db.get(s.itemId), s._creationTime);
  return out;
}

export const refresh = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u || u.learningOff) return null;
    const learned = learnProfile(await signalsFor(ctx, u), Date.now());
    await ctx.db.patch(userId, { learned, learnQueuedAt: undefined }); // the next action queues a fresh refresh
    return learned;
  },
});

/** Daily: refresh everyone who has learning on, so old habits fade even on quiet days. Pages of 100. */
export const refreshAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").paginate({ numItems: 100, cursor: cursor ?? null });
    let i = 0;
    for (const u of page.page) if (!u.learningOff && !u.isDemo) await ctx.scheduler.runAfter(i++ * 200, internal.learning.refresh, { userId: u._id });
    if (!page.isDone) await ctx.scheduler.runAfter(30_000, internal.learning.refreshAll, { cursor: page.continueCursor });
  },
});

/** What Necro has learned about you, exactly as the AI sees it. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const u = await requireUser(ctx);
    const learned = (u.learned as Learned | undefined) ?? null;
    return { enabled: !u.learningOff, learned, promptLine: u.learningOff ? null : learnedContext(learned) };
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const u = await requireUser(ctx);
    await ctx.db.patch(u._id, { learningOff: !enabled, learnQueuedAt: undefined });
    if (enabled) await ctx.scheduler.runAfter(0, internal.learning.refresh, { userId: u._id });
  },
});

/** Forget everything learned so far; only actions from now on count. */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const u = await requireUser(ctx);
    await ctx.db.patch(u._id, { learned: undefined, learnedResetAt: Date.now(), learnQueuedAt: undefined });
  },
});
