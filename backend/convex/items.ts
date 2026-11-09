import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { indexItem, scheduleCluster, unindexItem } from "./kindred";
import { scheduleOmenCheck, unmatchItem } from "./omens";

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
    kindred: !!i.kindredId, // part of a Kindred group (same story in another feed)
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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await listFor(ctx, user._id, args);
  },
});

/** Paginated item cards for one user. Shared by the UI query and the MCP list_items tool. */
export async function listFor(
  ctx: QueryCtx,
  uid: Id<"users">,
  {
    graveId,
    filter,
    sort = "newest",
    paginationOpts,
  }: {
    graveId?: Id<"graves">;
    filter: "all" | "unread" | "starred";
    sort?: "newest" | "relevance";
    paginationOpts: { numItems: number; cursor: string | null };
  },
) {
  {
    if (graveId) await requireOwned(ctx, uid, graveId);

    let q;
    if (sort === "relevance") {
      // Each combination has its own index, so a small feed or a few starred posts never scan everything.
      if (graveId) {
        q = ctx.db.query("items").withIndex("by_grave_score", (x) => x.eq("graveId", graveId)).order("desc");
        if (filter === "unread") q = q.filter((f) => f.eq(f.field("isRead"), false)); // bounded by one feed
        if (filter === "starred") q = q.filter((f) => f.eq(f.field("isStarred"), true));
      } else if (filter === "unread") {
        q = ctx.db.query("items").withIndex("by_user_read_score", (x) => x.eq("userId", uid).eq("isRead", false)).order("desc");
      } else if (filter === "starred") {
        q = ctx.db.query("items").withIndex("by_user_starred_score", (x) => x.eq("userId", uid).eq("isStarred", true)).order("desc");
      } else {
        q = ctx.db.query("items").withIndex("by_user_score", (x) => x.eq("userId", uid)).order("desc");
      }
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
  }
}

/** Full item for the reading pane, with its Séance and drafts. */
export const get = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const user = await requireUser(ctx);
    const item = await requireOwned(ctx, user._id, itemId);
    const grave = await ctx.db.get(item.graveId);
    const seance = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", itemId)).first();
    const drafts = await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", itemId)).take(3);
    const kindred = await kindredFor(ctx, item);
    return {
      ...itemCard(item, grave ? (grave.customTitle ?? grave.title) : undefined),
      contentHtml: item.fullHtml ?? item.contentHtml, // Exhumed full text when available
      exhumed: item.fullHtml !== undefined,
      kindredId: item.kindredId,
      kindred, // the same story in the user's other feeds
      // ghost = answered by Ghost mode: label "summary without AI" / "template draft" with a try-again button
      seance: seance
        ? { summary: seance.summary, score: seance.score, reason: seance.reason, model: seance.model, ghost: seance.model.startsWith("ghost:") }
        : null,
      drafts: drafts.map((d) => ({
        _id: d._id,
        platform: d.platform,
        text: d.text,
        hashtags: d.hashtags,
        status: d.status,
        ghost: d.model.startsWith("ghost:"),
      })),
    };
  },
});

/** Other items in the same Kindred group: same user, other feeds only. */
async function kindredFor(ctx: QueryCtx, item: Doc<"items">) {
  if (!item.kindredId) return [];
  const rows = await ctx.db.query("items").withIndex("by_kindred", (q) => q.eq("kindredId", item.kindredId)).take(20);
  const others = rows.filter((r) => r.userId === item.userId && r._id !== item._id && r.graveId !== item.graveId);
  const titles = await graveTitles(ctx, others);
  return others.map((r) => ({ _id: r._id, title: r.title, graveTitle: titles.get(r.graveId) ?? "", publishedAt: r.publishedAt }));
}

export const search = query({
  args: { query: v.string(), graveId: v.optional(v.id("graves")) },
  handler: async (ctx, { query: text, graveId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await searchFor(ctx, user._id, text, 30, graveId);
  },
});

/** Full-text title search scoped to one user. Shared by the UI, MCP and Ask the Crypt. */
export async function searchFor(ctx: QueryCtx, userId: Id<"users">, text: string, limit: number, graveId?: Id<"graves">) {
  const term = text.trim().slice(0, 200);
  if (!term) return [];
  if (graveId) await requireOwned(ctx, userId, graveId);
  const rows = await ctx.db
    .query("items")
    .withSearchIndex("search_text", (q) => {
      const s = q.search("title", term).eq("userId", userId);
      return graveId ? s.eq("graveId", graveId) : s;
    })
    .take(Math.min(Math.max(limit, 1), 50));
  const titles = await graveTitles(ctx, rows);
  return rows.map((i) => itemCard(i, titles.get(i.graveId)));
}

export type ItemCard = ReturnType<typeof itemCard>;

export const searchInternal = internalQuery({
  args: { userId: v.id("users"), query: v.string(), limit: v.number() },
  // Explicit return type breaks a type-inference cycle through the generated api.
  handler: (ctx, { userId, query: text, limit }): Promise<ItemCard[]> => searchFor(ctx, userId, text, limit),
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
    const fresh: { _id: Id<"items">; publishedAt: number }[] = [];
    for (const it of items) {
      const guid = it.guid.slice(0, 2000); // the stored length: compare the same value or long guids repeat forever
      const dup = await ctx.db
        .query("items")
        .withIndex("by_grave_guid", (q) => q.eq("graveId", graveId).eq("guid", guid))
        .first();
      if (dup) continue;
      // A new feed must not flood the unread count with its back catalogue.
      const isRead = firstFetch && fetchedAt - it.publishedAt > 14 * DAY;
      const title = it.title.slice(0, 500);
      const itemId = await ctx.db.insert("items", {
        userId,
        graveId,
        guid,
        title,
        link: it.link ?? undefined,
        author: it.author?.slice(0, 200) ?? undefined,
        publishedAt: it.publishedAt,
        contentHtml: capHtml(it.contentHtml),
        excerpt: it.excerpt.slice(0, 300),
        isRead,
        isStarred: false,
        risenAt: now,
      });
      await indexItem(ctx, { _id: itemId, userId, graveId, title, publishedAt: it.publishedAt });
      fresh.push({ _id: itemId, publishedAt: it.publishedAt });
      inserted++;
      if (!isRead) unread++;
      newest = Math.max(newest, Math.min(it.publishedAt, now));
    }
    if (inserted) {
      // lastNewItemAt tracks when the feed last published (drives the polling interval).
      await ctx.db.patch(graveId, { unreadCount: grave.unreadCount + unread, lastNewItemAt: newest });
      await scheduleCluster(ctx, userId);
      await scheduleOmenCheck(ctx, userId, fresh);
    }
    return { inserted };
  },
});

export const getOwnedInternal = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: (ctx, { userId, itemId }) => requireOwned(ctx, userId, itemId),
});

/**
 * Deletes one item and everything hanging off it: Séances, drafts, Kindred index row, Omen matches
 * and the group's cached Second Opinion. Used by retention, grave deletion and account deletion.
 */
export async function deleteItemCascade(ctx: MutationCtx, item: Doc<"items">) {
  for (const s of await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", item._id)).take(10)) await ctx.db.delete(s._id);
  for (const d of await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", item._id)).take(10)) await ctx.db.delete(d._id);
  await unindexItem(ctx, item._id);
  await unmatchItem(ctx, item._id);
  if (item.kindredId) {
    const kindredId = item.kindredId;
    const o = await ctx.db.query("opinions").withIndex("by_user_kindred", (q) => q.eq("userId", item.userId).eq("kindredId", kindredId)).first();
    if (o) await ctx.db.delete(o._id); // its sources changed; a fresh one is made on demand
  }
  await ctx.db.delete(item._id);
}

const PRUNE_GRAVES = 2;
const PRUNE_ITEMS = 25;

/**
 * Daily retention: deletes read, unstarred items older than 90 days with everything attached.
 * Small batches (2 feeds x 25 items) keep each run far below Convex read limits even with large
 * articles; the read-items index skips unread ones, and a full batch re-runs the same page.
 */
export const prune = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const cutoff = Date.now() - 90 * DAY;
    const page = await ctx.db.query("graves").paginate({ numItems: PRUNE_GRAVES, cursor: cursor ?? null });
    let more = false;
    for (const g of page.page) {
      const old = await ctx.db
        .query("items")
        .withIndex("by_grave_read", (q) => q.eq("graveId", g._id).eq("isRead", true).lt("publishedAt", cutoff))
        .take(PRUNE_ITEMS);
      let deleted = 0;
      for (const item of old) {
        if (item.isStarred) continue; // starred posts are kept forever
        await deleteItemCascade(ctx, item);
        deleted++;
      }
      if (old.length === PRUNE_ITEMS && deleted > 0) more = true;
    }
    if (more) await ctx.scheduler.runAfter(0, internal.items.prune, { cursor }); // same page again
    else if (!page.isDone) await ctx.scheduler.runAfter(0, internal.items.prune, { cursor: page.continueCursor });
  },
});

