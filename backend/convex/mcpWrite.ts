// MCP write tools: an AI assistant with a "read and write" key posts and schedules to the user's connected accounts.
// Like mcp.ts these functions are public (the Next.js MCP route calls them), so EVERY one re-checks MCP_SERVER_SECRET
// and the key itself (owner, scope "write", not revoked, not expired) here on the server: the route's own checks are
// never the only line of defence. Posting reuses the app's composer (social.composeFor), so the same rules apply:
// lengths, image rules, the scheduled cap, the hourly cap and "one post, once".

import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertSecret, fail } from "./lib/auth";
import { hitLimit } from "./rateLimits";
import { byUserPlatform, cancelFor, composeFor, modeFor, IMAGE_TYPES, MAX_IMAGE_BYTES } from "./social";
import { socialPlatform } from "./schema";
import { SOCIAL_PLATFORMS } from "../lib/social/post";
import { grantLabel } from "../lib/mcpOAuth";

/** Posts an AI assistant may create per key per hour (on top of the user's own hourly caps). */
export const MCP_POSTS_PER_HOUR_PER_KEY = 10;

/** An API key id or an OAuth grant id (mcpOAuth.ts): both carry userId, scope, expiresAt and revokedAt. */
export const mcpKeyId = v.union(v.id("apiKeys"), v.id("mcpGrants"));
const keyed = { secret: v.string(), userId: v.id("users"), keyId: mcpKeyId };

/** The key (or OAuth grant) that made this call: must belong to the user and be live. `needWrite` also requires scope "write". */
async function liveKey(
  ctx: QueryCtx | MutationCtx,
  secret: string,
  userId: Id<"users">,
  keyId: Id<"apiKeys"> | Id<"mcpGrants">,
  needWrite: boolean,
): Promise<{ prefix: string; scope: "read" | "write" }> {
  assertSecret(secret, "MCP_SERVER_SECRET");
  const key = await ctx.db.get(keyId);
  if (!key || key.userId !== userId || key.revokedAt || (key.expiresAt && key.expiresAt <= Date.now())) {
    fail("FORBIDDEN", "This key is not valid any more. Create a new one in Necro Settings.");
  }
  const scope = key.scope ?? "read";
  if (needWrite && scope !== "write") {
    fail("FORBIDDEN", "This key is read-only. Create a \"read and write\" key in Necro Settings to post.");
  }
  return { prefix: "prefix" in key ? key.prefix : grantLabel(key._id), scope };
}

// ---------- read (any live key) ----------

/** Which accounts are connected, and whether a post would go out on its own or as a reminder. Never tokens. */
export const connections = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const out = [];
    for (const platform of SOCIAL_PLATFORMS) {
      const c = await byUserPlatform(ctx, userId, platform);
      out.push({
        platform,
        connected: !!c && c.status === "active",
        account: c && c.status === "active" ? (c.name ?? c.username ?? null) : null,
        delivery: modeFor(platform, c), // "auto": posts on its own; "reminder": the user gets a reminder to share it
      });
    }
    return out;
  },
});

/** Recent and upcoming posts (last 30 days and next 90), newest first. */
export const posts = query({
  args: { ...keyed, limit: v.optional(v.number()) },
  handler: async (ctx, { secret, userId, keyId, limit }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const now = Date.now();
    const rows = await ctx.db
      .query("publishes")
      .withIndex("by_user_at", (q) => q.eq("userId", userId).gte("at", now - 30 * 86_400_000).lte("at", now + 90 * 86_400_000))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 20, 1), 50));
    return rows.map((r) => ({
      id: r._id,
      platform: r.platform,
      status: r.status, // scheduled | due | posting | posted | failed | canceled
      delivery: r.mode ?? "auto",
      at: new Date(r.at ?? r.createdAt).toISOString(),
      text: (r.text ?? "").slice(0, 300),
      hasImage: !!r.imageId,
      url: r.url ?? null,
      error: r.error ?? null,
      createdBy: r.via ? "ai-assistant" : "app",
    }));
  },
});

// ---------- write (scope "write" only) ----------

/** Post now, or schedule for `atIso`, to the chosen connected accounts, optionally with an image already stored. */
export const compose = mutation({
  args: {
    ...keyed,
    text: v.string(),
    platforms: v.array(socialPlatform),
    storageId: v.optional(v.id("_storage")),
    atIso: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, keyId, text, platforms, storageId, atIso }) => {
    const key = await liveKey(ctx, secret, userId, keyId, true);
    let at: number | undefined;
    if (atIso !== undefined) {
      at = Date.parse(atIso);
      if (!Number.isFinite(at)) fail("INVALID_INPUT", "Give the time as an ISO date with a timezone, e.g. 2026-11-25T09:00:00+08:00.");
    }
    const n = [...new Set(platforms)].length;
    for (let i = 0; i < Math.max(n, 1); i++) {
      if (!(await hitLimit(ctx, `mcpw:${keyId}`, MCP_POSTS_PER_HOUR_PER_KEY, 3_600_000))) {
        fail("LIMIT", `An AI assistant can create up to ${MCP_POSTS_PER_HOUR_PER_KEY} posts an hour with one key.`);
      }
    }
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND", "Unknown user.");
    const results = await composeFor(ctx, user, { caption: text, platforms, storageId, at }, `mcp:${key.prefix}`);
    return results.map((r) => ({
      id: r.publishId,
      platform: r.platform,
      delivery: r.mode,
      status: at === undefined ? (r.mode === "auto" ? "posting now" : "reminder now") : "scheduled",
      at: new Date(at ?? Date.now()).toISOString(),
    }));
  },
});

/** Cancel a scheduled post or reminder that has not gone out yet. */
export const cancel = mutation({
  args: { ...keyed, postId: v.id("publishes") },
  handler: async (ctx, { secret, userId, keyId, postId }) => {
    await liveKey(ctx, secret, userId, keyId, true);
    await cancelFor(ctx, userId, postId);
    return { id: postId, status: "canceled" };
  },
});

/** Called by mcpWriteNode.storeImage: checks the key before any image is fetched or stored. */
export const assertWriteKey = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, true);
    return true;
  },
});

/** Registers an image stored by mcpWriteNode for this user (same rules as the app's uploads). */
export const registerImage = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, storageId }) => {
    const meta = await ctx.db.system.get(storageId);
    const type = (meta?.contentType ?? "").toLowerCase();
    if (!meta || !(IMAGE_TYPES as readonly string[]).includes(type) || meta.size > MAX_IMAGE_BYTES) {
      if (meta) await ctx.storage.delete(storageId);
      fail("INVALID_INPUT", "Use a PNG or JPG image up to 8 MB.");
    }
    await ctx.db.insert("uploads", { userId, storageId, contentType: type, size: meta.size, createdAt: Date.now(), contentHash: meta.sha256 });
  },
});
