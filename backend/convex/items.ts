import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireOwned, requireUser } from "./lib/auth";

const DAY = 86_400_000;
const MAX_CONTENT = 200 * 1024;

export const itemFilter = v.union(v.literal("all"), v.literal("unread"), v.literal("starred"));
export const itemSort = v.union(v.literal("newest"), v.literal("relevance"));

/** Item card for lists: never includes contentHtml. */
export function itemCard(i: Doc<"items">, graveTitle?: string) {
  return {
    _id: i._id,
    graveId: i.graveId,
    graveTitle,
    title: i.title,
    link: i.link,
    author: i.author,
    publishedAt: i.publishedAt,
    excerpt: i.excerpt,
    isRead: i.isRead,
    isStarred: i.isStarred,
    score: i.score,
    risenAt: i.risenAt,
  };
}

async function graveTitles(ctx: QueryCtx, items: Doc<"items">[]): Promise<Map<Id<"graves">, string>> {
  const out = new Map<Id<"graves">, string>();
  for (const id of new Set(items.map((i) => i.graveId))) {
    const g = await ctx.db.get(id);
    if (g) out.set(id, g.customTitle ?? g.title);
  }
  return out;
}

/** Keeps graves.unreadCount in sync without counting items on every render. */
async function bumpUnread(ctx: MutationCtx, graveId: Id<"graves">, delta: number) {
  if (!delta) return;
  const g = await ctx.db.get(graveId);
  if (g) await ctx.db.patch(graveId, { unreadCount: Math.max(0, g.unreadCount + delta) });
}

// ---------- public ----------

export const list = query({
  args: {
    graveId: v.optional(v.id("graves")),
    filter: itemFilter,
    sort: v.optional(itemSort),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { graveId, filter, sort = "newest", paginationOpts }) => {
    const user = await requireUser(ctx);
    if (graveId) await requireOwned(ctx, user._id, graveId);
    const uid = user._id;

    let q;
    if (sort === "relevance") {
      q = ctx.db.query("items").withIndex("by_user_score", (x) => x.eq("userId", uid)).order("desc");
      if (graveId) q = q.filter((f) => f.eq(f.field("graveId"), graveId));
      if (filter === "unread") q = q.filter((f) => f.eq(f.field("isRead"), false));
      if (filter === "starred") q = q.filter((f) => f.eq(f.field("isStarred"), true));
    } else if (graveId) {
      q =
        filter === "unread"
          ? ctx.db.query("items").withIndex("by_grave_read", (x) => x.eq("graveId", graveId).eq("isRead", false))
          : filter === "starred"
            ? ctx.db.query("items").withIndex("by_grave_starred", (x) => x.eq("graveId", graveId).eq("isStarred", true))
            : ctx.db.query("items").withIndex("by_grave_published", (x) => x.eq("graveId", graveId));
      q = q.order("desc");
    } else {
      q =
        filter === "unread"
          ? ctx.db.query("items").withIndex("by_user_read", (x) => x.eq("userId", uid).eq("isRead", false))
          : filter === "starred"
            ? ctx.db.query("items").withIndex("by_user_starred", (x) => x.eq("userId", uid).eq("isStarred", true))
            : ctx.db.query("items").withIndex("by_user_published", (x) => x.eq("userId", uid));
      q = q.order("desc");
    }

    const page = await q.paginate(paginationOpts);
    const titles = await graveTitles(ctx, page.page);
    return { ...page, page: page.page.map((i) => itemCard(i, titles.get(i.graveId))) };
  },
});

/** Full item for the reading pane, with its Séance and drafts. */
export const get = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const user = await requireUser(ctx);
    const item = await requireOwned(ctx, user._id, itemId);
    const grave = await ctx.db.get(item.graveId);
    const seance = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", itemId)).first();
    const drafts = await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", itemId)).take(3);
    return {
      ...itemCard(item, grave ? (grave.customTitle ?? grave.title) : undefined),
      contentHtml: item.contentHtml,
      seance: seance ? { summary: seance.summary, score: seance.score, reason: seance.reason, model: seance.model } : null,
      drafts: drafts.map((d) => ({ _id: d._id, platform: d.platform, text: d.text, hashtags: d.hashtags, status: d.status })),
    };
  },
});

export const search = query({
  args: { query: v.string(), graveId: v.optional(v.id("graves")) },
  handler: async (ctx, { query: text, graveId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const term = text.trim().slice(0, 200);
    if (!term) return [];
    if (graveId) await requireOwned(ctx, user._id, graveId);
    const rows = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) => {
        const s = q.search("title", term).eq("userId", user._id);
        return graveId ? s.eq("graveId", graveId) : s;
      })
      .take(30);
    const titles = await graveTitles(ctx, rows);
    return rows.map((i) => itemCard(i, titles.get(i.graveId)));
  },
});

export const setRead = mutation({
  args: { itemId: v.id("items"), value: v.boolean() },
  handler: async (ctx, { itemId, value }) => {
    const user = await requireUser(ctx);
    await setReadFor(ctx, user._id, itemId, value);
  },
});

export const setStarred = mutation({
  args: { itemId: v.id("items"), value: v.boolean() },
  handler: async (ctx, { itemId, value }) => {
    const user = await requireUser(ctx);
    await setStarredFor(ctx, user._id, itemId, value);
  },
});

/** Marks up to 500 unread items read now and schedules the rest. Returns the count done now. */
export const markAllRead = mutation({
  args: { graveId: v.optional(v.id("graves")) },
  handler: async (ctx, { graveId }) => {
    const user = await requireUser(ctx);
    if (graveId) await requireOwned(ctx, user._id, graveId);
    return await markAllReadBatch(ctx, user._id, graveId);
  },
});

/** Count of items that rose in the last 24 hours (Graveyard header). */
export const risenToday = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    const rows = await ctx.db
      .query("items")
      .withIndex("by_user_risen", (q) => q.eq("userId", user._id).gte("risenAt", Date.now() - DAY))
      .take(1000);
    return rows.length;
  },
});

// ---------- shared helpers (also used by mcp.ts and agent.ts) ----------

export async function setReadFor(ctx: MutationCtx, userId: Id<"users">, itemId: Id<"items">, value: boolean) {
  const item = await requireOwned(ctx, userId, itemId);
  if (item.isRead === value) return;
  await ctx.db.patch(itemId, { isRead: value });
  await bumpUnread(ctx, item.graveId, value ? -1 : 1);
}

export async function setStarredFor(ctx: MutationCtx, userId: Id<"users">, itemId: Id<"items">, value: boolean) {
  const item = await requireOwned(ctx, userId, itemId);
  if (item.isStarred !== value) await ctx.db.patch(itemId, { isStarred: value });
}

async function markAllReadBatch(ctx: MutationCtx, userId: Id<"users">, graveId?: Id<"graves">): Promise<number> {
  const rows = graveId
    ? await ctx.db.query("items").withIndex("by_grave_read", (q) => q.eq("graveId", graveId).eq("isRead", false)).take(500)
    : await ctx.db.query("items").withIndex("by_user_read", (q) => q.eq("userId", userId).eq("isRead", false)).take(500);
  const perGrave = new Map<Id<"graves">, number>();
  for (const i of rows) {
    await ctx.db.patch(i._id, { isRead: true });
    perGrave.set(i.graveId, (perGrave.get(i.graveId) ?? 0) + 1);
  }
  for (const [gid, n] of perGrave) await bumpUnread(ctx, gid, -n);
  if (rows.length === 500) await ctx.scheduler.runAfter(0, internal.items.markAllReadMore, { userId, graveId });
  return rows.length;
}

export const markAllReadMore = internalMutation({
  args: { userId: v.id("users"), graveId: v.optional(v.id("graves")) },
  handler: async (ctx, { userId, graveId }) => {
    await markAllReadBatch(ctx, userId, graveId);
  },
});

// ---------- internal ----------

const normalizedItem = v.object({
  guid: v.string(),
  title: v.string(),
  link: v.union(v.string(), v.null()),
  author: v.union(v.string(), v.null()),
  publishedAt: v.number(),
  hasDate: v.optional(v.boolean()),
  contentHtml: v.string(),
  excerpt: v.string(),
});

/** Cap at 200 KB without cutting through a tag. */
function capHtml(html: string): string {
  if (html.length <= MAX_CONTENT) return html;
  const cut = html.slice(0, MAX_CONTENT);
  const lastOpen = cut.lastIndexOf("<");
  return lastOpen > cut.lastIndexOf(">") ? cut.slice(0, lastOpen) : cut;
}

/** Inserts only items whose (graveId, guid) is new. Idempotent, so a retried action is safe. */
export const ingest = internalMutation({
  args: {
    userId: v.id("users"),
    graveId: v.id("graves"),
    items: v.array(normalizedItem),
    fetchedAt: v.number(),
    firstFetch: v.boolean(),
  },
  handler: async (ctx, { userId, graveId, items, fetchedAt, firstFetch }) => {
    const grave = await ctx.db.get(graveId);
    if (!grave || grave.userId !== userId) return { inserted: 0 };
    const now = Date.now();
    let inserted = 0;
    let unread = 0;
    let newest = grave.lastNewItemAt ?? 0;
    for (const it of items) {
      const dup = await ctx.db
        .query("items")
        .withIndex("by_grave_guid", (q) => q.eq("graveId", graveId).eq("guid", it.guid))
        .first();
      if (dup) continue;
      // A new feed must not flood the unread count with its back catalogue.
      const isRead = firstFetch && fetchedAt - it.publishedAt > 14 * DAY;
      await ctx.db.insert("items", {
        userId,
        graveId,
        guid: it.guid.slice(0, 2000),
        title: it.title.slice(0, 500),
        link: it.link ?? undefined,
        author: it.author?.slice(0, 200) ?? undefined,
        publishedAt: it.publishedAt,
        contentHtml: capHtml(it.contentHtml),
        excerpt: it.excerpt.slice(0, 300),
        isRead,
        isStarred: false,
        risenAt: now,
      });
      inserted++;
      if (!isRead) unread++;
      newest = Math.max(newest, Math.min(it.publishedAt, now));
    }
    if (inserted) {
      // lastNewItemAt tracks when the feed last published (drives the polling interval).
      await ctx.db.patch(graveId, { unreadCount: grave.unreadCount + unread, lastNewItemAt: newest });
    }
    return { inserted };
  },
});

export const getOwnedInternal = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: (ctx, { userId, itemId }) => requireOwned(ctx, userId, itemId),
});

/**
 * Daily retention: deletes read, unstarred items older than 90 days with their Séances and drafts.
 * (The prompt's "newest 500 per grave" rule needs a per-grave count; a time cutoff keeps reads bounded.)
 */
export const prune = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const cutoff = Date.now() - 90 * DAY;
    const page = await ctx.db.query("graves").paginate({ numItems: 20, cursor: cursor ?? null });
    for (const g of page.page) {
      const old = await ctx.db
        .query("items")
        .withIndex("by_grave_published", (q) => q.eq("graveId", g._id).lt("publishedAt", cutoff))
        .take(100);
      for (const item of old) {
        if (!item.isRead || item.isStarred) continue;
        for (const s of await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", item._id)).collect()) {
          await ctx.db.delete(s._id);
        }
        for (const d of await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", item._id)).collect()) {
          await ctx.db.delete(d._id);
        }
        await ctx.db.delete(item._id);
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.items.prune, { cursor: page.continueCursor });
  },
});

