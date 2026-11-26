// MCP write tools: an AI assistant with a write key ("posts:write", stored as scope "write") posts and schedules to
// the user's connected accounts. Like mcp.ts these functions are public (the Next.js MCP route calls them), so EVERY
// one re-checks MCP_SERVER_SECRET and the key itself (owner, scope, not revoked, not expired) here on the server: the
// route's own checks are never the only line of defence. Posting reuses the app's composer (social.composeFor) and
// scheduler (socialNode.runScheduled), so the same rules apply: lengths, image rules, delivery (auto or reminder),
// the scheduled cap, the hourly cap and "one post, once". Every successful write is audited in the same transaction.

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertSecret, fail, getCurrentUser } from "./lib/auth";
import { hitLimit } from "./rateLimits";
import {
  byUserPlatform,
  cancelGroupFor,
  composeFor,
  editScheduledFor,
  groupRows,
  modeFor,
  NAMES,
  publishNowFor,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_UPLOADS_PER_DAY,
} from "./social";
import { socialPlatform } from "./schema";
import { POST_LIMITS, postLength, SOCIAL_PLATFORMS, type SocialPlatform } from "../lib/social/post";
import { grantLabel } from "../lib/mcpOAuth";
import { mcpWriteLimits } from "../lib/limits";
import { editableError, overallStatus } from "../lib/social/postStatus";
import { parseScheduleAt, zoned } from "../lib/social/time";

/** Posts an AI assistant may create per key per hour (on top of the daily cap and the user's own hourly caps). */
export const MCP_POSTS_PER_HOUR_PER_KEY = 10;

/** An API key id or an OAuth grant id (mcpOAuth.ts): both carry userId, scope, expiresAt and revokedAt. */
export const mcpKeyId = v.union(v.id("apiKeys"), v.id("mcpGrants"));
const keyed = { secret: v.string(), userId: v.id("users"), keyId: mcpKeyId };
type KeyId = Id<"apiKeys"> | Id<"mcpGrants">;

/** The key (or OAuth grant) that made this call: must belong to the user and be live. `needWrite` also requires scope "write". */
async function liveKey(
  ctx: QueryCtx | MutationCtx,
  secret: string,
  userId: Id<"users">,
  keyId: KeyId,
  needWrite: boolean,
): Promise<{ prefix: string; scope: "read" | "write" }> {
  assertSecret(secret, "MCP_SERVER_SECRET");
  const key = await ctx.db.get(keyId);
  if (!key || key.userId !== userId || key.revokedAt || (key.expiresAt && key.expiresAt <= Date.now())) {
    fail("FORBIDDEN", "This key is not valid any more. Create a new one in Necro Settings.");
  }
  const scope = key.scope ?? "read";
  if (needWrite && scope !== "write") {
    fail("FORBIDDEN", "This key is read-only (no posts:write). Turn on posting for it in Necro Settings → MCP keys, then reconnect.");
  }
  return { prefix: "prefix" in key ? key.prefix : grantLabel(key._id), scope };
}

/** A write call: live write key, then the per-key hourly cap on write calls. */
async function writeKey(ctx: MutationCtx, secret: string, userId: Id<"users">, keyId: KeyId) {
  const key = await liveKey(ctx, secret, userId, keyId, true);
  const { writeCallsPerHour } = mcpWriteLimits();
  if (!(await hitLimit(ctx, `mcpwc:${keyId}`, writeCallsPerHour, 3_600_000))) {
    fail("LIMIT", `An AI assistant can make up to ${writeCallsPerHour} posting calls an hour with one key. Try again later.`);
  }
  return key;
}

async function audit(
  ctx: MutationCtx,
  a: { userId: Id<"users">; keyId: KeyId; keyLabel: string; tool: string; postId?: string; status: "ok" | "refused"; message?: string },
) {
  await ctx.db.insert("mcpAudit", { ...a, at: Date.now() });
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Text rules with the count in the message, so the assistant can trim to fit. */
function checkText(text: string, platforms: SocialPlatform[]) {
  if (!text.trim()) fail("INVALID_INPUT", "The post text is empty.");
  for (const p of new Set(platforms)) {
    const n = postLength(p, text.trim());
    if (n > POST_LIMITS[p]) fail("INVALID_INPUT", `Too long for ${NAMES[p]}: ${thousands(n)} characters (limit ${thousands(POST_LIMITS[p])}).`);
  }
}

function scheduleMs(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const r = parseScheduleAt(iso);
  if (!r.ok) fail("INVALID_INPUT", r.message);
  if (r.ms <= Date.now()) fail("INVALID_INPUT", "That time is in the past. Pick a time at least a minute from now.");
  return r.ms;
}

/** An image id handed out by upload_post_image, owned by this user. */
async function ownedImage(ctx: MutationCtx, userId: Id<"users">, imageId: string | undefined): Promise<Id<"_storage"> | undefined> {
  if (imageId === undefined) return undefined;
  const id = ctx.db.system.normalizeId("_storage", imageId);
  const up = id ? await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", id)).unique() : null;
  if (!id || !up || up.userId !== userId) fail("NOT_FOUND", "Unknown imageId. Upload the image with upload_post_image first.");
  return id;
}

async function ownedItem(ctx: MutationCtx, userId: Id<"users">, itemId: string | undefined): Promise<Id<"items"> | undefined> {
  if (itemId === undefined) return undefined;
  const id = ctx.db.normalizeId("items", itemId);
  const item = id ? await ctx.db.get(id) : null;
  if (!id || !item || item.userId !== userId) fail("NOT_FOUND", "Unknown sourceItemId. Use an item id from list_items or search_items.");
  return id;
}

/** Daily and hourly post caps per key: one count per account the post goes to. */
async function countPosts(ctx: MutationCtx, keyId: KeyId, n: number) {
  const { postsPerDay } = mcpWriteLimits();
  for (let i = 0; i < Math.max(n, 1); i++) {
    if (!(await hitLimit(ctx, `mcpd:${keyId}`, postsPerDay, 86_400_000))) {
      fail("LIMIT", `An AI assistant can create up to ${postsPerDay} posts a day with one key (one per account).`);
    }
    if (!(await hitLimit(ctx, `mcpw:${keyId}`, MCP_POSTS_PER_HOUR_PER_KEY, 3_600_000))) {
      fail("LIMIT", `An AI assistant can create up to ${MCP_POSTS_PER_HOUR_PER_KEY} posts an hour with one key.`);
    }
  }
}

const DELIVERY_NOTE = {
  auto: "Necro posts it to this account on its own at the scheduled time.",
  reminder: "Not posted automatically: Necro shows the user a reminder to share it at that time (account not connected, PNG on Instagram, or TikTok).",
};

/** One post as the assistant sees it: current state from the database, never cached. No tokens, no internal fields. */
async function postView(ctx: QueryCtx | MutationCtx, rows: Doc<"publishes">[]) {
  const live = rows.filter((r) => r.status !== "canceled");
  const first = live[0] ?? rows[0];
  const at = first.at ?? first.createdAt;
  const failed = rows.find((r) => r.status === "failed");
  return {
    postId: first.groupId ?? first._id,
    text: first.text ?? "",
    image: first.imageId ? { imageId: first.imageId, previewUrl: await ctx.storage.getUrl(first.imageId) } : null,
    sourceItemId: first.itemId ?? null,
    createdBy: first.via ? "ai-assistant" : "app",
    status: overallStatus(rows.map((r) => r.status)),
    scheduledFor: zoned(at),
    liveUrl: rows.find((r) => r.status === "posted" && r.url)?.url ?? null,
    error: failed?.error ?? null,
    perPlatform: rows.map((r) => ({
      platform: r.platform,
      publishId: r._id,
      delivery: r.mode ?? "auto",
      deliveryNote: DELIVERY_NOTE[r.mode ?? "auto"],
      status: r.status,
      liveUrl: r.url ?? null,
      error: r.error ?? null,
      postedAt: r.status === "posted" && r.finishedAt ? zoned(r.finishedAt) : null,
    })),
  };
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

/** Recent and upcoming posts (last 30 days and next 90), newest first. One row per account; postId groups them. */
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
      postId: r.groupId ?? r._id, // for get_post, update_post, cancel_post, publish_post_now
      platform: r.platform,
      status: r.status, // scheduled | due | posting | posted | failed | canceled
      delivery: r.mode ?? "auto",
      at: new Date(r.at ?? r.createdAt).toISOString(),
      atSingapore: zoned(r.at ?? r.createdAt).singapore,
      text: (r.text ?? "").slice(0, 300),
      hasImage: !!r.imageId,
      url: r.url ?? null,
      error: r.error ?? null,
      createdBy: r.via ? "ai-assistant" : "app",
    }));
  },
});

/** One post with every account's live status and link. */
export const post = query({
  args: { ...keyed, postId: v.string() },
  handler: async (ctx, { secret, userId, keyId, postId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    return await postView(ctx, await groupRows(ctx, userId, postId));
  },
});

// ---------- write (scope "write" only) ----------

/** Post now, or schedule for `atIso`, to the chosen accounts, optionally with an uploaded image. */
export const compose = mutation({
  args: {
    ...keyed,
    text: v.string(),
    platforms: v.array(socialPlatform),
    storageId: v.optional(v.id("_storage")), // older callers
    imageId: v.optional(v.string()), // from upload_post_image
    atIso: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    sourceItemId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, keyId, text, platforms, storageId, imageId, atIso, idempotencyKey, sourceItemId }) => {
    const idem = idempotencyKey?.trim();
    if (idem !== undefined && (idem.length < 1 || idem.length > 200)) fail("INVALID_INPUT", "idempotencyKey must be 1 to 200 characters.");
    // The same idempotency key never makes a second post: a retried call gets the first one back.
    if (idem) {
      await liveKey(ctx, secret, userId, keyId, true);
      const prior = await ctx.db.query("publishes").withIndex("by_user_idem", (q) => q.eq("userId", userId).eq("idemKey", idem)).first();
      if (prior) return { ...(await postView(ctx, await groupRows(ctx, userId, prior.groupId ?? prior._id))), duplicate: true };
    }
    const key = await writeKey(ctx, secret, userId, keyId);
    const label = { userId, keyId, keyLabel: key.prefix, tool: "create_post" };
    const chosen = [...new Set(platforms)];
    if (!chosen.length) fail("INVALID_INPUT", "Pick at least one platform: linkedin, x, instagram or tiktok.");
    checkText(text, chosen);
    const at = scheduleMs(atIso);
    const image = storageId ?? (await ownedImage(ctx, userId, imageId));
    const itemId = await ownedItem(ctx, userId, sourceItemId);
    await countPosts(ctx, keyId, chosen.length);
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND", "Unknown user.");
    const results = await composeFor(ctx, user, { caption: text, platforms: chosen, storageId: image, at }, `mcp:${key.prefix}`, { idemKey: idem, itemId });
    const rows = await groupRows(ctx, userId, results[0].publishId);
    const view = await postView(ctx, rows);
    await audit(ctx, { ...label, postId: view.postId, status: "ok" });
    return { ...view, when: at === undefined ? ("now" as const) : ("scheduled" as const), duplicate: false };
  },
});

/** Edit a post that is still scheduled: text, image, accounts and/or time. */
export const update = mutation({
  args: {
    ...keyed,
    postId: v.string(),
    text: v.optional(v.string()),
    imageId: v.optional(v.string()),
    platforms: v.optional(v.array(socialPlatform)),
    atIso: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, keyId, postId, text, imageId, platforms, atIso }) => {
    const key = await writeKey(ctx, secret, userId, keyId);
    if (text === undefined && imageId === undefined && platforms === undefined && atIso === undefined) {
      fail("INVALID_INPUT", "Nothing to change: give text, imageId, platforms or scheduleAt.");
    }
    const rows = await groupRows(ctx, userId, postId);
    const blocked = editableError(rows.map((r) => r.status), "edit"); // status first: the clearest reason wins
    if (blocked) fail("INVALID_INPUT", blocked);
    const live = rows.filter((r) => r.status !== "canceled");
    const chosen = platforms ? [...new Set(platforms)] : live.map((r) => r.platform);
    if (!chosen.length) fail("INVALID_INPUT", "Keep at least one platform, or cancel the post instead.");
    if (text !== undefined || platforms !== undefined) checkText(text ?? live[0]?.text ?? "", chosen);
    const at = scheduleMs(atIso);
    const storageId = await ownedImage(ctx, userId, imageId);
    const added = chosen.filter((p) => !live.some((r) => r.platform === p)).length;
    if (added) await countPosts(ctx, keyId, added);
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND", "Unknown user.");
    await editScheduledFor(ctx, user, rows, { text, storageId, platforms, at }, `mcp:${key.prefix}`);
    const id = live[0]?.groupId ?? live[0]?._id ?? postId;
    const view = await postView(ctx, await groupRows(ctx, userId, id));
    await audit(ctx, { userId, keyId, keyLabel: key.prefix, tool: "update_post", postId: view.postId, status: "ok" });
    return view;
  },
});

/** Send a scheduled post right away (reminders become due right away). */
export const publishNow = mutation({
  args: { ...keyed, postId: v.string() },
  handler: async (ctx, { secret, userId, keyId, postId }) => {
    const key = await writeKey(ctx, secret, userId, keyId);
    const rows = await groupRows(ctx, userId, postId);
    await publishNowFor(ctx, rows);
    const view = await postView(ctx, await groupRows(ctx, userId, postId));
    await audit(ctx, { userId, keyId, keyLabel: key.prefix, tool: "publish_post_now", postId: view.postId, status: "ok" });
    return { ...view, note: "Sending now. Call get_post in a few seconds for the result and the live link." };
  },
});

/** Cancel a scheduled post or reminder that has not gone out yet (every account of it). */
export const cancel = mutation({
  args: { ...keyed, postId: v.string() },
  handler: async (ctx, { secret, userId, keyId, postId }) => {
    const key = await writeKey(ctx, secret, userId, keyId);
    const rows = await groupRows(ctx, userId, postId);
    await cancelGroupFor(ctx, userId, rows);
    const view = await postView(ctx, await groupRows(ctx, userId, postId));
    await audit(ctx, { userId, keyId, keyLabel: key.prefix, tool: "cancel_post", postId: view.postId, status: "ok" });
    return { id: postId, postId: view.postId, status: "canceled" as const, perPlatform: view.perPlatform };
  },
});

/** Called by mcpWriteNode.storeImage before any image is fetched or stored: live write key + write-call cap. */
export const startImageUpload = mutation({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    const key = await writeKey(ctx, secret, userId, keyId);
    return { keyLabel: key.prefix };
  },
});

/**
 * request_image_upload: a one-time Convex storage URL the assistant POSTs the raw image bytes to (no base64 in the
 * conversation). The upload returns { storageId }, which upload_post_image then checks and registers.
 */
export const uploadUrl = mutation({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    const key = await writeKey(ctx, secret, userId, keyId);
    const today = await ctx.db
      .query("uploads")
      .withIndex("by_user", (q) => q.eq("userId", userId).gt("createdAt", Date.now() - 86_400_000))
      .take(MAX_UPLOADS_PER_DAY);
    if (today.length >= MAX_UPLOADS_PER_DAY) fail("LIMIT", `You can upload up to ${MAX_UPLOADS_PER_DAY} images a day.`);
    await audit(ctx, { userId, keyId, keyLabel: key.prefix, tool: "upload_post_image", status: "ok", message: "upload link issued" });
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

/** For upload_post_image with a storageId: does the file exist, and is it still unclaimed or this user's? */
export const storageInfo = internalQuery({
  args: { userId: v.id("users"), storageId: v.string() },
  handler: async (ctx, { userId, storageId }) => {
    const id = ctx.db.system.normalizeId("_storage", storageId);
    const meta = id ? await ctx.db.system.get(id) : null;
    if (!id || !meta) return null;
    const owner = await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", id)).unique();
    return { id, size: meta.size, contentType: meta.contentType ?? null, claimedBy: owner ? (owner.userId === userId ? "me" : "other") : null };
  },
});

/** Kept for older callers: checks the key only. */
export const assertWriteKey = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, true);
    return true;
  },
});

/** Registers an image stored by mcpWriteNode for this user (same rules as the app's uploads). */
export const registerImage = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage"), keyId: v.optional(mcpKeyId), keyLabel: v.optional(v.string()) },
  handler: async (ctx, { userId, storageId, keyId, keyLabel }) => {
    const meta = await ctx.db.system.get(storageId);
    const type = (meta?.contentType ?? "").toLowerCase();
    if (!meta || !(IMAGE_TYPES as readonly string[]).includes(type) || meta.size > MAX_IMAGE_BYTES) {
      if (meta) await ctx.storage.delete(storageId);
      fail("INVALID_INPUT", "Use a PNG or JPG image up to 5 MB.");
    }
    await ctx.db.insert("uploads", { userId, storageId, contentType: type, size: meta.size, createdAt: Date.now(), contentHash: meta.sha256 });
    if (keyId) await audit(ctx, { userId, keyId, keyLabel: keyLabel ?? "", tool: "upload_post_image", status: "ok" });
  },
});

/** The MCP route records a refused write call (bad input, limit, read-only key) so the audit log shows it too. */
export const auditRefusal = mutation({
  args: { ...keyed, tool: v.string(), postId: v.optional(v.string()), message: v.string() },
  handler: async (ctx, { secret, userId, keyId, tool, postId, message }) => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    const key = await ctx.db.get(keyId);
    if (!key || key.userId !== userId) return; // not this user's key: nothing to record
    const keyLabel = "prefix" in key ? key.prefix : grantLabel(key._id);
    await audit(ctx, { userId, keyId, keyLabel, tool: tool.slice(0, 40), postId: postId?.slice(0, 64), status: "refused", message: message.slice(0, 200) });
  },
});

// ---------- screenshot_page: a real screenshot of a Necro page, taken by Necro's server as the user ----------

/** Screenshots a key or connection may take per hour (each one opens a headless browser). */
export const SCREENSHOTS_PER_HOUR_PER_KEY = 20;

/**
 * Called by the MCP route before it opens the headless browser: any live key or connection (read-only too: a
 * screenshot only shows data the key can already read, and the browser never clicks anything), rate limited and
 * audited. Returns the user's Clerk id (to sign the browser in for one page) and public profile slug.
 */
export const screenshotGrant = mutation({
  args: { ...keyed, page: v.string() },
  handler: async (ctx, { secret, userId, keyId, page }) => {
    const key = await liveKey(ctx, secret, userId, keyId, false);
    if (!(await hitLimit(ctx, `mcpshot:${keyId}`, SCREENSHOTS_PER_HOUR_PER_KEY, 3_600_000))) {
      fail("LIMIT", `An AI assistant can take up to ${SCREENSHOTS_PER_HOUR_PER_KEY} screenshots an hour with one key or connection.`);
    }
    const user = await ctx.db.get(userId);
    if (!user?.clerkId || user.clerkId.startsWith("seed_") || user.clerkId.startsWith("demo_")) {
      fail("FORBIDDEN", "Screenshots need a real signed-in Necro account.");
    }
    await audit(ctx, { userId, keyId, keyLabel: key.prefix, tool: "screenshot_page", status: "ok", message: page.slice(0, 60) });
    return { clerkId: user.clerkId, publicSlug: user.publicSlug ?? null };
  },
});

// ---------- the user's own view (Settings → MCP keys & usage) ----------

/** The latest MCP write calls for the signed-in user. */
export const auditLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("mcpAudit")
      .withIndex("by_user_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 30, 1), 100));
    return rows.map((r) => ({ _id: r._id, keyLabel: r.keyLabel, tool: r.tool, postId: r.postId ?? null, status: r.status, message: r.message ?? null, at: r.at }));
  },
});

/** The limits in force, for the Settings panel. */
export const limits = query({
  args: {},
  handler: async () => ({ ...mcpWriteLimits(), postsPerHour: MCP_POSTS_PER_HOUR_PER_KEY }),
});
