// Second Opinion storage and context (spec .kiro/specs/second-opinion). Scoped to one user.
import { v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireOwned } from "./lib/auth";
import { htmlToPlain } from "../lib/text";
import { labelFor, MAX_SOURCES } from "../lib/ai/opinion";

export const isGhostOpinion = (model: string) => model.startsWith("ghost:");

/** The item plus up to 3 siblings from other feeds (one per feed, newest first). Same user only. */
async function groupFor(ctx: QueryCtx, userId: Id<"users">, item: Doc<"items">) {
  if (!item.kindredId) return null;
  const kindredId = item.kindredId;
  const rows = await ctx.db.query("items").withIndex("by_kindred", (q) => q.eq("kindredId", kindredId)).take(40);
  const picked: Doc<"items">[] = [item];
  const feeds = new Set([item.graveId]);
  for (const r of rows.sort((a, b) => b.publishedAt - a.publishedAt)) {
    if (picked.length >= MAX_SOURCES) break;
    if (r.userId !== userId || feeds.has(r.graveId)) continue;
    feeds.add(r.graveId);
    picked.push(r);
  }
  if (picked.length < 2) return null;
  return { kindredId, items: picked, itemIds: picked.map((p) => p._id).sort() };
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function view(o: Doc<"opinions">) {
  return { sources: o.sources, agree: o.agree, differ: o.differ, onlyOne: o.onlyOne, model: o.model, ghost: isGhostOpinion(o.model) };
}
export type OpinionView = ReturnType<typeof view>;

/** The cached Second Opinion for an item's group, if it still covers the same sources. */
export const forItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const item = await requireOwned(ctx, user._id, itemId);
    const group = await groupFor(ctx, user._id, item);
    if (!group) return null;
    const o = await ctx.db.query("opinions").withIndex("by_user_kindred", (q) => q.eq("userId", user._id).eq("kindredId", group.kindredId)).first();
    return o && sameIds(o.itemIds, group.itemIds) ? view(o) : null;
  },
});

/** Everything compare needs, owner-checked: labelled sources with plain text, and any usable cached result. */
export const context = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: async (ctx, { userId, itemId }) => {
    const item = await requireOwned(ctx, userId, itemId);
    const group = await groupFor(ctx, userId, item);
    if (!group) return null;
    const sources = [];
    for (const [i, it] of group.items.entries()) {
      const g = await ctx.db.get(it.graveId);
      sources.push({
        label: labelFor(i),
        itemId: it._id,
        feed: g ? (g.customTitle ?? g.title) : "",
        title: it.title,
        text: htmlToPlain(it.fullHtml ?? it.contentHtml, 2000) || it.excerpt,
      });
    }
    const o = await ctx.db.query("opinions").withIndex("by_user_kindred", (q) => q.eq("userId", userId).eq("kindredId", group.kindredId)).first();
    const cached = o && sameIds(o.itemIds, group.itemIds) ? view(o) : null;
    return { kindredId: group.kindredId, itemIds: group.itemIds, sources, cached };
  },
});

const sourceV = v.object({ label: v.string(), itemId: v.id("items"), feed: v.string(), title: v.string(), key: v.array(v.string()) });

/** Upserts the group's Second Opinion. A model answer replaces a Ghost one; a Ghost one never replaces a model one for the same sources. */
export const save = internalMutation({
  args: {
    userId: v.id("users"),
    kindredId: v.string(),
    itemIds: v.array(v.id("items")),
    sources: v.array(sourceV),
    agree: v.array(v.object({ point: v.string(), sources: v.array(v.string()) })),
    differ: v.array(v.object({ point: v.string(), views: v.array(v.object({ source: v.string(), says: v.string() })) })),
    onlyOne: v.array(v.object({ claim: v.string(), source: v.string() })),
    model: v.string(),
  },
  handler: async (ctx, a): Promise<OpinionView> => {
    for (const s of a.sources) await requireOwned(ctx, a.userId, s.itemId);
    const existing = await ctx.db.query("opinions").withIndex("by_user_kindred", (q) => q.eq("userId", a.userId).eq("kindredId", a.kindredId)).first();
    if (existing && sameIds(existing.itemIds, a.itemIds) && !isGhostOpinion(existing.model) && isGhostOpinion(a.model)) return view(existing);
    const doc = { userId: a.userId, kindredId: a.kindredId, itemIds: a.itemIds, sources: a.sources, agree: a.agree, differ: a.differ, onlyOne: a.onlyOne, model: a.model };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("opinions", doc);
    return view({ ...doc, _id: existing?._id ?? ("" as Id<"opinions">), _creationTime: 0 });
  },
});
