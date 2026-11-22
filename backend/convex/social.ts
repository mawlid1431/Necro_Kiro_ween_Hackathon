// Connectors: the user's own LinkedIn, X, Instagram and TikTok accounts.
// Queries and mutations only (default runtime). OAuth and posting live in socialNode.ts.
// Nothing here returns a token: the browser sees account names and status, never credentials.

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { socialPlatform } from "./schema";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { credsFor } from "../lib/social/providers";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "../lib/social/post";

const STATE_TTL_MS = 15 * 60 * 1000;
export const PUBLISHES_PER_HOUR_PER_USER = 30;

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
    const out: Pick<Doc<"publishes">, "_id" | "platform" | "status" | "url" | "note" | "error" | "createdAt">[] = [];
    for (const platform of SOCIAL_PLATFORMS) {
      const p = await ctx.db
        .query("publishes")
        .withIndex("by_item", (q) => q.eq("itemId", itemId).eq("platform", platform))
        .order("desc")
        .first();
      if (p) out.push({ _id: p._id, platform: p.platform, status: p.status, url: p.url, note: p.note, error: p.error, createdAt: p.createdAt });
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
    if (recent.length >= PUBLISHES_PER_HOUR_PER_USER) fail("LIMIT", `You can post up to ${PUBLISHES_PER_HOUR_PER_USER} times an hour from Necro.`);
    // One post at a time per platform for an article: a double click never posts twice.
    if (recent.some((p) => p.itemId === a.itemId && p.platform === a.platform && p.status === "posting" && p.createdAt > now - 120_000)) {
      fail("DUPLICATE", "This post is already going out.");
    }
    return await ctx.db.insert("publishes", { ...a, status: "posting", createdAt: now });
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
    if (rest.status === "posted") await ctx.db.patch(p.draftId, { status: "shared" });
  },
});
