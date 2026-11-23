// Connectors: the user's own LinkedIn, X, Instagram and TikTok accounts.
// Queries and mutations only (default runtime). OAuth and posting live in socialNode.ts.
// Nothing here returns a token: the browser sees account names and status, never credentials.

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { socialPlatform } from "./schema";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { credsFor } from "../lib/social/providers";
import { draftFor, finalPost, POST_LIMITS, postLength, SOCIAL_PLATFORMS, type SocialPlatform } from "../lib/social/post";
import { internal } from "./_generated/api";
import { articleKey, duplicateMessage, isBlocking, manualKey } from "../lib/social/dedupe";
import { recordShared } from "./circle";

const STATE_TTL_MS = 15 * 60 * 1000;
export const PUBLISHES_PER_HOUR_PER_USER = 30;
/** Posts and reminders a user can create per hour, across Post now, Schedule and the composer. */
export const PUBLISH_ROWS_PER_HOUR_PER_USER = 60;
/** A post still "posting" after this long lost its job (server restart): it is marked failed, never retried. */
export const STUCK_POSTING_MS = 15 * 60 * 1000;

const PLATFORM_NAMES: Record<SocialPlatform, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok" };
const fmtWhen = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** A row with the same content that is going out, waiting or posted (cancelled and failed rows do not count). */
async function blockingDuplicate(ctx: { db: import("./_generated/server").QueryCtx["db"] }, userId: Id<"users">, key: string, except?: Id<"publishes">) {
  const rows = await ctx.db.query("publishes").withIndex("by_user_key", (q) => q.eq("userId", userId).eq("contentKey", key)).take(50);
  return rows.find((r) => r._id !== except && isBlocking(r.status)) ?? null;
}

/** Refuses a post whose content already went out, is going out, or is waiting (atomic: Convex mutations are serialised). */
async function refuseDuplicate(ctx: { db: import("./_generated/server").QueryCtx["db"] }, userId: Id<"users">, key: string, platform: SocialPlatform) {
  const dup = await blockingDuplicate(ctx, userId, key);
  if (dup) fail("DUPLICATE", duplicateMessage(PLATFORM_NAMES[platform], dup, fmtWhen));
}

/** Fair use across every way of creating a post, so one account cannot flood the platforms or the scheduler. */
async function checkHourlyCap(ctx: { db: import("./_generated/server").QueryCtx["db"] }, userId: Id<"users">, adding: number) {
  const recent = await ctx.db
    .query("publishes")
    .withIndex("by_user", (q) => q.eq("userId", userId).gt("createdAt", Date.now() - 3_600_000))
    .take(PUBLISH_ROWS_PER_HOUR_PER_USER + 1);
  if (recent.length + adding > PUBLISH_ROWS_PER_HOUR_PER_USER) {
    fail("LIMIT", `You can create up to ${PUBLISH_ROWS_PER_HOUR_PER_USER} posts or reminders an hour. Try again a little later.`);
  }
}

export type ConnectionView = {
  platform: SocialPlatform;
  configured: boolean; // the app's keys for this platform are set on the server
  connected: boolean;
  name?: string;
  username?: string;
  avatarUrl?: string;
  status?: "active" | "expired";
  expiresAt?: number;
  canRefresh: boolean;
  connectedAt?: number;
};

const byUserPlatform = (ctx: { db: import("./_generated/server").QueryCtx["db"] }, userId: Id<"users">, platform: SocialPlatform) =>
  ctx.db.query("connections").withIndex("by_user_platform", (q) => q.eq("userId", userId).eq("platform", platform)).unique();

/** One row per platform, live: the Connectors page and the Resurrect dialog both read this. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<ConnectionView[]> => {
    const user = await getCurrentUser(ctx);
    const rows = user ? await ctx.db.query("connections").withIndex("by_user_platform", (q) => q.eq("userId", user._id)).collect() : [];
    const now = Date.now();
    return SOCIAL_PLATFORMS.map((platform) => {
      const c = rows.find((r) => r.platform === platform);
      const canRefresh = !!c && (platform === "instagram" || !!c.refreshToken);
      const lapsed = !!c && !canRefresh && !!c.expiresAt && c.expiresAt < now;
      return {
        platform,
        configured: credsFor(platform) !== null,
        connected: !!c,
        name: c?.name,
        username: c?.username,
        avatarUrl: c?.avatarUrl,
        status: c ? (lapsed ? "expired" : c.status) : undefined,
        expiresAt: c?.expiresAt,
        canRefresh,
        connectedAt: c?.connectedAt,
      };
    });
  },
});

export const disconnect = mutation({
  args: { platform: socialPlatform },
  handler: async (ctx, { platform }) => {
    const user = await requireUser(ctx);
    const c = await byUserPlatform(ctx, user._id, platform);
    if (c) await ctx.db.delete(c._id);
  },
});

/** Latest "Post now" per platform for an article, live while it posts. */
export const publishesForItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const item = await ctx.db.get(itemId);
    if (!item || item.userId !== user._id) return [];
    const out: (Pick<Doc<"publishes">, "_id" | "platform" | "url" | "note" | "error" | "createdAt"> & { status: "posting" | "posted" | "failed" })[] = [];
    for (const platform of SOCIAL_PLATFORMS) {
      // Post now results only: scheduled posts and reminders live in Witching Hour.
      const recent = await ctx.db
        .query("publishes")
        .withIndex("by_item", (q) => q.eq("itemId", itemId).eq("platform", platform))
        .order("desc")
        .take(20);
      const p = recent.find((r) => r.status === "posting" || r.status === "posted" || r.status === "failed");
      if (p) out.push({ _id: p._id, platform: p.platform, status: p.status as "posting" | "posted" | "failed", url: p.url, note: p.note, error: p.error, createdAt: p.createdAt });
    }
    return out;
  },
});

// ---------- internal: OAuth state ----------

export const saveState = internalMutation({
  args: { userId: v.id("users"), platform: socialPlatform, state: v.string(), verifier: v.optional(v.string()) },
  handler: async (ctx, a) => {
    // Old unfinished attempts by this user are dropped.
    const old = await ctx.db.query("oauthStates").withIndex("by_user", (q) => q.eq("userId", a.userId)).collect();
    for (const o of old) if (o.createdAt < Date.now() - STATE_TTL_MS || o.platform === a.platform) await ctx.db.delete(o._id);
    await ctx.db.insert("oauthStates", { ...a, createdAt: Date.now() });
  },
});

/** Returns the state once (then it is gone), only for the same user and platform, within 15 minutes. */
export const takeState = internalMutation({
  args: { userId: v.id("users"), platform: socialPlatform, state: v.string() },
  handler: async (ctx, { userId, platform, state }) => {
    const row = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.userId !== userId || row.platform !== platform || row.createdAt < Date.now() - STATE_TTL_MS) return null;
    return { verifier: row.verifier };
  },
});

// ---------- internal: connections ----------

const sealedFields = {
  accessToken: v.string(),
  refreshToken: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  refreshExpiresAt: v.optional(v.number()),
  scope: v.optional(v.string()),
};

export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    platform: socialPlatform,
    accountId: v.string(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    ...sealedFields,
  },
  handler: async (ctx, a) => {
    const existing = await byUserPlatform(ctx, a.userId, a.platform);
    const now = Date.now();
    if (existing) await ctx.db.replace(existing._id, { ...a, status: "active", connectedAt: now, refreshedAt: now });
    else await ctx.db.insert("connections", { ...a, status: "active", connectedAt: now, refreshedAt: now });
  },
});

export const getConnection = internalQuery({
  args: { userId: v.id("users"), platform: socialPlatform },
  handler: (ctx, { userId, platform }) => byUserPlatform(ctx, userId, platform),
});

export const updateTokens = internalMutation({
  args: { connectionId: v.id("connections"), ...sealedFields },
  handler: async (ctx, { connectionId, ...t }) => {
    const c = await ctx.db.get(connectionId);
    if (!c) return;
    await ctx.db.patch(connectionId, {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken ?? c.refreshToken,
      expiresAt: t.expiresAt,
      refreshExpiresAt: t.refreshExpiresAt ?? c.refreshExpiresAt,
      scope: t.scope ?? c.scope,
      status: "active",
      refreshedAt: Date.now(),
    });
  },
});

export const markExpired = internalMutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    if (await ctx.db.get(connectionId)) await ctx.db.patch(connectionId, { status: "expired" });
  },
});

/** Instagram long-lived tokens are refreshed while still valid; the daily cron picks the ones due. */
export const instagramDue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("connections").withIndex("by_platform", (q) => q.eq("platform", "instagram")).collect();
    return rows
      .filter((c) => c.status === "active" && c.expiresAt && c.expiresAt > now && c.expiresAt < now + 20 * 86_400_000 && (c.refreshedAt ?? c.connectedAt) < now - 86_400_000)
      .map((c) => c._id);
  },
});

export const connectionById = internalQuery({
  args: { connectionId: v.id("connections") },
  handler: (ctx, { connectionId }) => ctx.db.get(connectionId),
});

// ---------- internal: publishing ----------

/** The draft, its article and the source name, only if the draft is the caller's. */
export const draftForPublish = internalQuery({
  args: { userId: v.id("users"), draftId: v.id("drafts") },
  handler: async (ctx, { userId, draftId }) => {
    const d = await requireOwned(ctx, userId, draftId);
    const item = await ctx.db.get(d.itemId);
    if (!item || item.userId !== userId) fail("NOT_FOUND", "That could not be found.");
    const grave = await ctx.db.get(item.graveId);
    return { draft: d, item: { _id: item._id, title: item.title, link: item.link ?? grave?.siteUrl }, source: grave?.title ?? "" };
  },
});

export const startPublish = internalMutation({
  args: { userId: v.id("users"), itemId: v.id("items"), draftId: v.id("drafts"), platform: socialPlatform },
  handler: async (ctx, a) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("publishes")
      .withIndex("by_user", (q) => q.eq("userId", a.userId).gt("createdAt", now - 3_600_000))
      .collect();
    if (recent.filter((r) => r.mode === "auto" && r.status !== "scheduled").length >= PUBLISHES_PER_HOUR_PER_USER) {
      fail("LIMIT", `You can post up to ${PUBLISHES_PER_HOUR_PER_USER} times an hour from Necro.`);
    }
    await checkHourlyCap(ctx, a.userId, 1);
    // One post, once: not again after it went out, and not while it is going out or scheduled (double clicks too).
    const contentKey = articleKey(a.itemId, a.platform);
    await refuseDuplicate(ctx, a.userId, contentKey, a.platform);
    return await ctx.db.insert("publishes", { ...a, kind: "article", status: "posting", createdAt: now, at: now, mode: "auto", contentKey, postingSince: now });
  },
});

export const finishPublish = internalMutation({
  args: {
    publishId: v.id("publishes"),
    status: v.union(v.literal("posted"), v.literal("failed")),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { publishId, ...rest }) => {
    const p = await ctx.db.get(publishId);
    if (!p) return;
    await ctx.db.patch(publishId, { ...rest, finishedAt: Date.now() });
    if (rest.status === "posted" && p.draftId) await ctx.db.patch(p.draftId, { status: "shared" });
    if (rest.status === "posted") await recordShared(ctx, publishId); // the Circle: exactly once, in this same transaction
  },
});

// ---------- Witching Hour: scheduled posts, reminders and the live timeline ----------

export const SCHEDULE_MIN_LEAD_MS = 60 * 1000;
export const SCHEDULE_MAX_AHEAD_MS = 90 * 86_400_000;
export const MAX_PENDING_SCHEDULED = 100;
const NAMES: Record<SocialPlatform, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok" };

/**
 * Auto-post needs a working direct connection. TikTok is always a reminder: its sharing rules require the
 * creator to confirm each post (privacy, disclosure, consent) at the moment it goes out.
 */
function modeFor(platform: SocialPlatform, conn: Doc<"connections"> | null): "auto" | "reminder" {
  if (platform === "tiktok") return "reminder";
  return conn && conn.status === "active" && credsFor(platform) !== null ? "auto" : "reminder";
}

function checkTime(at: number, now: number) {
  if (!Number.isFinite(at) || at < now + SCHEDULE_MIN_LEAD_MS) fail("INVALID_INPUT", "Pick a time at least a minute from now.");
  if (at > now + SCHEDULE_MAX_AHEAD_MS) fail("INVALID_INPUT", "You can schedule up to 90 days ahead.");
}

/** Schedule a post (auto) or a reminder to share it, at `at` (ms epoch). */
export const schedule = mutation({
  args: { draftId: v.id("drafts"), platform: socialPlatform, text: v.string(), at: v.number() },
  handler: async (ctx, { draftId, platform, text, at }) => {
    const user = await requireUser(ctx);
    const draft = await requireOwned(ctx, user._id, draftId);
    if (draft.platform !== draftFor(platform)) fail("INVALID_INPUT", "That draft is for another platform.");
    const item = await ctx.db.get(draft.itemId);
    if (!item || item.userId !== user._id) fail("NOT_FOUND", "That could not be found.");
    const now = Date.now();
    checkTime(at, now);
    const grave = await ctx.db.get(item.graveId);
    const post = finalPost(platform, text, draft.hashtags, item.link ?? grave?.siteUrl);
    if (!post.trim()) fail("INVALID_INPUT", "The post is empty.");
    if (postLength(platform, post) > POST_LIMITS[platform]) fail("INVALID_INPUT", `Too long for ${NAMES[platform]}. Trim it to schedule.`);
    const pending = await ctx.db
      .query("publishes")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "scheduled"))
      .take(MAX_PENDING_SCHEDULED);
    if (pending.length >= MAX_PENDING_SCHEDULED) fail("LIMIT", `You can have up to ${MAX_PENDING_SCHEDULED} scheduled posts.`);
    await checkHourlyCap(ctx, user._id, 1);
    const contentKey = articleKey(item._id, platform);
    await refuseDuplicate(ctx, user._id, contentKey, platform);

    const mode = modeFor(platform, await byUserPlatform(ctx, user._id, platform));
    const publishId = await ctx.db.insert("publishes", {
      userId: user._id,
      itemId: item._id,
      draftId,
      platform,
      kind: "article",
      status: "scheduled",
      createdAt: now,
      at,
      mode,
      text: text.trim(),
      contentKey,
    });
    const jobId = await ctx.scheduler.runAt(at, internal.socialNode.runScheduled, { publishId });
    await ctx.db.patch(publishId, { jobId });
    return { publishId, mode };
  },
});

async function ownedPublish(ctx: MutationCtx, userId: Id<"users">, publishId: Id<"publishes">): Promise<Doc<"publishes">> {
  const p = await ctx.db.get(publishId);
  if (!p || p.userId !== userId) fail("NOT_FOUND", "That could not be found.");
  return p;
}

export const cancelScheduled = mutation({
  args: { publishId: v.id("publishes") },
  handler: async (ctx, { publishId }) => {
    const user = await requireUser(ctx);
    const p = await ownedPublish(ctx, user._id, publishId);
    if (p.status !== "scheduled" && p.status !== "due") fail("INVALID_INPUT", "Only scheduled posts or reminders can be cancelled.");
    if (p.jobId) await ctx.scheduler.cancel(p.jobId);
    await ctx.db.patch(publishId, { status: "canceled", finishedAt: Date.now(), jobId: undefined });
  },
});

export const reschedule = mutation({
  args: { publishId: v.id("publishes"), at: v.number() },
  handler: async (ctx, { publishId, at }) => {
    const user = await requireUser(ctx);
    const p = await ownedPublish(ctx, user._id, publishId);
    if (p.status !== "scheduled" && p.status !== "due") fail("INVALID_INPUT", "Only scheduled posts or reminders can be moved.");
    checkTime(at, Date.now());
    if (p.jobId) await ctx.scheduler.cancel(p.jobId);
    const jobId = await ctx.scheduler.runAt(at, internal.socialNode.runScheduled, { publishId });
    await ctx.db.patch(publishId, { at, status: "scheduled", jobId, error: undefined });
  },
});

/** A reminder was shared by hand: record it as posted. */
export const markShared = mutation({
  args: { publishId: v.id("publishes") },
  handler: async (ctx, { publishId }) => {
    const user = await requireUser(ctx);
    const p = await ownedPublish(ctx, user._id, publishId);
    if (p.status !== "due" && p.status !== "scheduled") fail("INVALID_INPUT", "This one is already done.");
    if (p.jobId) await ctx.scheduler.cancel(p.jobId);
    await ctx.db.patch(publishId, { status: "posted", finishedAt: Date.now(), jobId: undefined, note: "shared" });
    if (p.draftId) await ctx.db.patch(p.draftId, { status: "shared" });
    await recordShared(ctx, publishId);
  },
});

export type TimelineEntry = {
  _id: Id<"publishes">;
  kind: "article" | "manual";
  imageUrl?: string; // manual post image
  platform: SocialPlatform;
  status: Doc<"publishes">["status"];
  mode: "auto" | "reminder";
  at: number;
  url?: string;
  error?: string;
  note?: string;
  post: string; // the exact text that is (or was) shared
  itemId?: Id<"items">;
  itemTitle: string; // the article title, or the first line of a manual post
  link?: string;
  source: string;
};

const firstLine = (t: string) => {
  const line = t.trim().split("\n")[0] ?? "";
  return line.length > 90 ? `${line.slice(0, 88)}…` : line;
};

/** Everything between `from` and `to`: scheduled, due, posted, failed and cancelled. Live as jobs run. */
export const timeline = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<TimelineEntry[]> => {
    const user = await getCurrentUser(ctx);
    if (!user || !(to > from) || to - from > 400 * 86_400_000) return [];
    const rows = await ctx.db
      .query("publishes")
      .withIndex("by_user_at", (q) => q.eq("userId", user._id).gte("at", from).lte("at", to))
      .take(1000);
    const out: TimelineEntry[] = [];
    for (const r of rows) {
      const base = { _id: r._id, platform: r.platform, status: r.status, mode: r.mode ?? "auto", at: r.at ?? r.createdAt, url: r.url, error: r.error, note: r.note };
      if (r.kind === "manual" || !r.itemId || !r.draftId) {
        const text = r.text ?? "";
        out.push({
          ...base,
          kind: "manual",
          imageUrl: r.imageId ? ((await ctx.storage.getUrl(r.imageId)) ?? undefined) : undefined,
          post: text,
          itemTitle: firstLine(text) || "Image post",
          source: "",
        });
        continue;
      }
      const [item, draft] = await Promise.all([ctx.db.get(r.itemId), ctx.db.get(r.draftId)]);
      if (!item || !draft) continue;
      const grave = await ctx.db.get(item.graveId);
      const link = item.link ?? grave?.siteUrl;
      out.push({
        ...base,
        kind: "article",
        post: finalPost(r.platform, r.text ?? draft.text, draft.hashtags, link),
        itemId: item._id,
        itemTitle: item.title,
        link,
        source: grave?.customTitle ?? grave?.title ?? "",
      });
    }
    return out;
  },
});

/** Reminders whose time has come (nav badge and browser notification). */
export const dueReminders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("publishes")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "due"))
      .take(50);
    const out: { _id: Id<"publishes">; platform: SocialPlatform; at: number; itemTitle: string }[] = [];
    for (const r of rows) {
      const item = r.itemId ? await ctx.db.get(r.itemId) : null;
      out.push({ _id: r._id, platform: r.platform, at: r.at ?? r.createdAt, itemTitle: item?.title ?? (firstLine(r.text ?? "") || "Image post") });
    }
    return out;
  },
});

// ---------- internal: the scheduled job ----------

/** Claims a scheduled row for its job, once: reminders become due, auto posts become posting. */
export const claimScheduled = internalMutation({
  args: { publishId: v.id("publishes") },
  handler: async (ctx, { publishId }) => {
    const p = await ctx.db.get(publishId);
    if (!p || p.status !== "scheduled") return null;
    // Last line of defence: if the same post went out meanwhile (by any path), do not send it again.
    const dup = p.contentKey ? await blockingDuplicate(ctx, p.userId, p.contentKey, publishId) : null;
    if (dup && (dup.status === "posted" || dup.status === "posting")) {
      await ctx.db.patch(publishId, { status: "canceled", jobId: undefined, finishedAt: Date.now(), note: "duplicate", error: "Not sent: the same post already went out." });
      return null;
    }
    if (p.mode === "reminder") {
      await ctx.db.patch(publishId, { status: "due", jobId: undefined });
      return null;
    }
    await ctx.db.patch(publishId, { status: "posting", jobId: undefined, postingSince: Date.now() });
    return p;
  },
});

// ---------- Witching Hour composer: your own image + caption, to the accounts you pick ----------

export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOADS_PER_DAY = 50;

/** Step 1 of an upload: a short-lived URL the browser posts the file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const today = await ctx.db
      .query("uploads")
      .withIndex("by_user", (q) => q.eq("userId", user._id).gt("createdAt", Date.now() - 86_400_000))
      .take(MAX_UPLOADS_PER_DAY);
    if (today.length >= MAX_UPLOADS_PER_DAY) fail("LIMIT", `You can upload up to ${MAX_UPLOADS_PER_DAY} images a day.`);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: check the file really is a JPEG or PNG under 8 MB, and record who owns it. */
export const registerUpload = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) fail("NOT_FOUND", "The upload did not arrive. Try again.");
    const type = (meta.contentType ?? "").toLowerCase();
    if (!(IMAGE_TYPES as readonly string[]).includes(type) || meta.size > MAX_IMAGE_BYTES) {
      await ctx.storage.delete(storageId);
      fail("INVALID_INPUT", "Use a JPG or PNG image up to 8 MB.");
    }
    if (await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", storageId)).unique()) fail("DUPLICATE", "Already uploaded.");
    await ctx.db.insert("uploads", { userId: user._id, storageId, contentType: type, size: meta.size, createdAt: Date.now() });
    return { storageId, url: await ctx.storage.getUrl(storageId), contentType: type };
  },
});

export const ownedUpload = internalQuery({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, storageId }) => {
    const u = await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", storageId)).unique();
    return u && u.userId === userId ? u : null;
  },
});

/**
 * Post now (`at` omitted) or schedule one post per chosen account. Connected accounts post on their own;
 * the others (and TikTok) become reminders. Instagram and TikTok need an image.
 */
export const composePost = mutation({
  args: {
    caption: v.string(),
    platforms: v.array(socialPlatform),
    storageId: v.optional(v.id("_storage")),
    at: v.optional(v.number()),
  },
  handler: async (ctx, { caption, platforms, storageId, at }) => {
    const user = await requireUser(ctx);
    const text = caption.trim();
    const chosen = [...new Set(platforms)];
    if (!chosen.length) fail("INVALID_INPUT", "Pick at least one account.");
    if (!text && !storageId) fail("INVALID_INPUT", "Add an image or a caption.");
    let upload: Doc<"uploads"> | null = null;
    if (storageId) {
      upload = await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", storageId)).unique();
      if (!upload || upload.userId !== user._id) fail("NOT_FOUND", "That image could not be found. Upload it again.");
    }
    const now = Date.now();
    if (at !== undefined) checkTime(at, now);
    for (const p of chosen) {
      if (postLength(p, text) > POST_LIMITS[p]) fail("INVALID_INPUT", `The caption is too long for ${NAMES[p]} (${POST_LIMITS[p]} characters).`);
      if ((p === "instagram" || p === "tiktok") && !upload) fail("INVALID_INPUT", `${NAMES[p]} needs an image.`);
    }
    const pending = await ctx.db
      .query("publishes")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "scheduled"))
      .take(MAX_PENDING_SCHEDULED);
    if (pending.length + chosen.length > MAX_PENDING_SCHEDULED) fail("LIMIT", `You can have up to ${MAX_PENDING_SCHEDULED} scheduled posts.`);
    await checkHourlyCap(ctx, user._id, chosen.length);
    // One post, once per account: the same caption and image cannot go to the same platform twice
    // (checked for every platform first, so nothing is created when one of them is a duplicate).
    const keys = new Map(chosen.map((p) => [p, manualKey(p, text, upload?.storageId)] as const));
    for (const p of chosen) await refuseDuplicate(ctx, user._id, keys.get(p)!, p);

    const results: { platform: SocialPlatform; mode: "auto" | "reminder"; publishId: Id<"publishes"> }[] = [];
    for (const platform of chosen) {
      let mode = modeFor(platform, await byUserPlatform(ctx, user._id, platform));
      // Instagram only takes JPEG photos: a PNG becomes a reminder you share from your phone.
      if (platform === "instagram" && mode === "auto" && upload?.contentType !== "image/jpeg") mode = "reminder";
      const when = at ?? now;
      const publishId = await ctx.db.insert("publishes", {
        userId: user._id,
        kind: "manual",
        platform,
        status: "scheduled",
        createdAt: now,
        at: when,
        mode,
        text,
        imageId: upload?.storageId,
        contentKey: keys.get(platform),
      });
      const jobId = at === undefined
        ? await ctx.scheduler.runAfter(0, internal.socialNode.runScheduled, { publishId })
        : await ctx.scheduler.runAt(at, internal.socialNode.runScheduled, { publishId });
      await ctx.db.patch(publishId, { jobId });
      results.push({ platform, mode, publishId });
    }
    return results;
  },
});

export const voiceOf = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const p = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return p ? { tone: p.tone, audience: p.audience, wordsToUse: p.wordsToUse, wordsToAvoid: p.wordsToAvoid, samplePosts: p.samplePosts } : null;
  },
});

// ---------- reliability: stuck posts, and what each article has on each platform ----------

/**
 * A post whose job died mid-way (deploy or crash) would show "Posting…" forever. After 15 minutes it is marked
 * failed with an honest message. It is never retried automatically: the platform may already have it.
 */
export const sweepStuck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_POSTING_MS;
    const stuck = await ctx.db.query("publishes").withIndex("by_status_since", (q) => q.eq("status", "posting").lt("postingSince", cutoff)).take(200);
    for (const p of stuck) {
      await ctx.db.patch(p._id, {
        status: "failed",
        finishedAt: Date.now(),
        error: `We could not confirm this post. Check your ${PLATFORM_NAMES[p.platform]} account before posting it again.`,
      });
    }
    return stuck.length;
  },
});

export type PostState = { platform: SocialPlatform; posted?: { at: number; url?: string }; pending?: { at: number; status: "scheduled" | "due" | "posting" } };

/** Live, per platform: has this article already gone out, or is it waiting? Resurrect locks its buttons on this. */
export const postStateForItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }): Promise<PostState[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const item = await ctx.db.get(itemId);
    if (!item || item.userId !== user._id) return [];
    const out: PostState[] = [];
    for (const platform of SOCIAL_PLATFORMS) {
      const rows = await ctx.db
        .query("publishes")
        .withIndex("by_user_key", (q) => q.eq("userId", user._id).eq("contentKey", articleKey(itemId, platform)))
        .take(50);
      const posted = rows.filter((r) => r.status === "posted").sort((a, b) => (b.at ?? b.createdAt) - (a.at ?? a.createdAt))[0];
      const pending = rows.find((r) => r.status === "scheduled" || r.status === "due" || r.status === "posting");
      out.push({
        platform,
        posted: posted ? { at: posted.at ?? posted.createdAt, url: posted.url } : undefined,
        pending: pending ? { at: pending.at ?? pending.createdAt, status: pending.status as "scheduled" | "due" | "posting" } : undefined,
      });
    }
    return out;
  },
});
