// Kindred: the same story reported by several of one user's feeds (spec .kiro/specs/kindred).
// Reads only kindredIndex rows (titles), never article HTML, and never crosses users.
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { clusterKindred } from "../lib/ai/kindred";
import { hitLimit } from "./rateLimits";

const HOUR = 3_600_000;
const WINDOW = 48 * HOUR;
const MAX_ROWS = 500;
const DEBOUNCE = 60_000;

/** Called by items.ingest after inserting: at most one clustering run per user per minute. */
export async function scheduleCluster(ctx: MutationCtx, userId: Id<"users">) {
  // Items that arrive while a run is pending are still picked up, because the run reads them later.
  if (await hitLimit(ctx, `kindred:${userId}`, 1, DEBOUNCE)) {
    await ctx.scheduler.runAfter(DEBOUNCE, internal.kindred.cluster, { userId });
  }
}

export async function indexItem(ctx: MutationCtx, item: { _id: Id<"items">; userId: Id<"users">; graveId: Id<"graves">; title: string; publishedAt: number }) {
  await ctx.db.insert("kindredIndex", { userId: item.userId, itemId: item._id, graveId: item.graveId, title: item.title.slice(0, 300), publishedAt: item.publishedAt });
}

export async function unindexItem(ctx: MutationCtx, itemId: Id<"items">) {
  for (const row of await ctx.db.query("kindredIndex").withIndex("by_item", (q) => q.eq("itemId", itemId)).take(5)) {
    await ctx.db.delete(row._id);
  }
}

/** Groups the user's recent items across feeds and stores a stable kindredId on each member. */
export const cluster = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("kindredIndex")
      .withIndex("by_user_published", (q) => q.eq("userId", userId).gte("publishedAt", now - WINDOW))
      .order("desc")
      .take(MAX_ROWS);
    const byId = new Map(rows.map((r) => [r.itemId as string, r]));
    const groups = clusterKindred(rows.map((r) => ({ id: r.itemId, graveId: r.graveId, title: r.title, publishedAt: r.publishedAt })));

    let changed = 0;
    for (const ids of groups) {
      const members = ids.map((id) => byId.get(id)).filter((r): r is Doc<"kindredIndex"> => !!r);
      const kindredId = stableId(members);
      for (const m of members) {
        if (m.kindredId === kindredId) continue;
        await ctx.db.patch(m._id, { kindredId });
        const item = await ctx.db.get(m.itemId);
        if (item && item.userId === userId) await ctx.db.patch(item._id, { kindredId });
        changed++;
      }
    }

    // Rows older than a week can never join a group again.
    const old = await ctx.db
      .query("kindredIndex")
      .withIndex("by_user_published", (q) => q.eq("userId", userId).lt("publishedAt", now - 7 * 24 * HOUR))
      .take(200);
    for (const r of old) await ctx.db.delete(r._id);

    return { groups: groups.length, changed };
  },
});

/** Keeps an existing id when any member has one (smallest, so merges are deterministic); else the oldest item's id. */
export function stableId(members: Pick<Doc<"kindredIndex">, "itemId" | "publishedAt" | "kindredId">[]): string {
  const existing = members.map((m) => m.kindredId).filter((k): k is string => !!k).sort();
  if (existing.length) return existing[0];
  const oldest = [...members].sort((a, b) => a.publishedAt - b.publishedAt || (a.itemId < b.itemId ? -1 : 1))[0];
  return oldest.itemId;
}

/** One-off: index the last 48 h of items for every user and cluster them. Paginated over users. */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").paginate({ numItems: 10, cursor: cursor ?? null });
    const since = Date.now() - WINDOW;
    for (const u of page.page) {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user_published", (q) => q.eq("userId", u._id).gte("publishedAt", since))
        .take(200);
      for (const i of items) {
        const has = await ctx.db.query("kindredIndex").withIndex("by_item", (q) => q.eq("itemId", i._id)).first();
        if (!has) await indexItem(ctx, i);
      }
      if (items.length) await ctx.scheduler.runAfter(0, internal.kindred.cluster, { userId: u._id });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.kindred.backfill, { cursor: page.continueCursor });
  },
});
