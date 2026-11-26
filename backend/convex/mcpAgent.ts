// MCP full access: everything the signed-in user can see and do in the Necro app, for an AI assistant.
// Like mcp.ts / mcpWrite.ts every function here is public (the Next.js MCP route calls it), so EVERY one re-checks
// MCP_SERVER_SECRET and the key or connection itself (liveKey / writeKey). Writes need scope "write", are rate limited
// per key AND per user, and write an mcpAudit row in the same transaction. No business rule lives here: each write
// calls the same helper the app's own mutation calls (renameFor, setReadFor, composeFor, saveVoiceFor, ...).

import { v } from "convex/values";
import { action, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, getCurrentUser, requireOwned, utcDay } from "./lib/auth";
import { audit, checkText, countPosts, liveKey, mcpKeyId, ownedImage, ownedItem, postView, scheduleMs, updateQueuedFor, writeKey } from "./mcpWrite";
import { byUserPlatform, cancelGroupFor, composeFor, groupRows, modeFor, NAMES, publishNowFor, PUBLISHES_PER_HOUR_PER_USER } from "./social";
import { overviewFor } from "./dashboard";
import { usageToday } from "./aiUsage";
import { markAllReadBatch, setReadFor, setStarredFor } from "./items";
import { layToRestFor, moveFor, renameFor } from "./graves";
import { createOmenFor, removeOmenFor } from "./omens";
import { saveVoiceFor } from "./voice";
import { setDisplayNameFor, setInterestsFor, setPreferencesFor } from "./users";
import { socialPlatform } from "./schema";
import { DAILY_AI_LIMITS, mcpWriteLimits } from "../lib/limits";
import { credsFor } from "../lib/social/providers";
import { POST_LIMITS, postLength, SOCIAL_PLATFORMS, type SocialPlatform } from "../lib/social/post";
import { grantLabel } from "../lib/mcpOAuth";
import { lastDays, localDay, safeZone, zonedFor } from "../lib/social/time";
import type { DraftView } from "./drafts";

const keyed = { secret: v.string(), userId: v.id("users"), keyId: mcpKeyId };
type KeyId = Id<"apiKeys"> | Id<"mcpGrants">;
type K = { secret: string; userId: Id<"users">; keyId: KeyId };
const UNTRUSTED = "untrusted web content";
const DAY = 86_400_000;

async function userOf(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const u = await ctx.db.get(userId);
  if (!u) fail("NOT_FOUND", "Unknown user.");
  return u;
}

/** Risky actions run only after the assistant asked the user: the call must say confirm: true. */
function needConfirm(confirm: boolean | undefined, what: string) {
  if (confirm !== true) fail("CONFIRM_REQUIRED", `Ask the user first: ${what}. Then call again with confirm: true.`);
}

/** One write call: live write key, both rate limits, then the change, then the audit row (all in one transaction). */
async function write<T>(ctx: MutationCtx, k: K, tool: string, fn: () => Promise<T>, postId?: (r: T) => string | undefined, message?: string): Promise<T> {
  const key = await writeKey(ctx, k.secret, k.userId, k.keyId);
  const out = await fn();
  await audit(ctx, { userId: k.userId, keyId: k.keyId, keyLabel: key.prefix, tool, postId: postId?.(out), status: "ok", message: message?.slice(0, 200) });
  return out;
}

function idOf<T extends "items" | "graves" | "omens">(ctx: QueryCtx | MutationCtx, table: T, raw: string): Id<T> {
  const id = ctx.db.normalizeId(table, raw);
  if (!id) fail("NOT_FOUND", `No ${table === "graves" ? "feed" : table === "items" ? "article" : "topic"} with that id.`);
  return id;
}

// ================================================================ read: profile, settings, access

/** get_profile: who the user is, their limits and usage today, setup, and what THIS key may do. Never tokens. */
export const profile = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    const key = await liveKey(ctx, secret, userId, keyId, false);
    const user = await userOf(ctx, userId);
    const tz = safeZone(user.timezone);
    const now = Date.now();
    const o = await overviewFor(ctx, user, now);
    const usage = await usageToday(ctx, userId);
    const postsToday = await ctx.db.query("publishes").withIndex("by_user", (q) => q.eq("userId", userId).gte("createdAt", now - DAY)).take(500);
    const k = await ctx.db.get(keyId);
    const { postsPerDay, writeCallsPerHour } = mcpWriteLimits();
    return {
      name: user.name ?? null,
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      clerkId: user.clerkId, // the MCP route uses it to look up the avatar, then removes it
      plan: "free", // Necro has one plan today; the limits below are what it includes
      timezone: tz,
      createdAt: zonedFor(user.createdAt, tz),
      onboarded: user.onboardedAt !== undefined,
      publicProfile: user.profilePublic ? { slug: user.publicSlug ?? null, bio: user.bio ?? null } : null,
      limitsToday: {
        seances: usage.seance,
        askCryptQuestions: usage.ask,
        postDraftsFromArticles: usage.resurrect,
        aiCaptions: usage.caption,
        posts: { createdLast24h: postsToday.length, perHourLimit: PUBLISHES_PER_HOUR_PER_USER },
        mcpPosts: { perDayPerKey: postsPerDay, writeCallsPerHourPerKey: writeCallsPerHour },
      },
      dailyAiLimits: DAILY_AI_LIMITS,
      setup: o.checklist,
      setupNext: setupHints(o.checklist),
      thisConnection: {
        label: key.prefix,
        kind: k && "prefix" in k ? "api key" : "connected app",
        name: k ? ("prefix" in k ? k.name : k.clientName) : null,
        scope: key.scope === "write" ? "read and write" : "read only",
        canPost: key.scope === "write",
      },
    };
  },
});

function setupHints(c: { feeds: boolean; interests: boolean; voice: boolean; connected: boolean; firstPost: boolean; mcpKey: boolean }) {
  const out: string[] = [];
  if (!c.feeds) out.push("feeds: add a feed with add_grave");
  if (!c.interests) out.push("interests: set them with set_interests");
  if (!c.voice) out.push("voice: describe your tone and add sample posts with set_voice");
  if (!c.connected) out.push("connected: connect LinkedIn in Necro Settings → Connected accounts (only the user can do this)");
  if (!c.firstPost) out.push("firstPost: draft_post, show it to the user, then schedule_post or publish_post");
  return out;
}

/** get_settings: everything on the Settings page that is stored on the server. */
export const settings = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const user = await userOf(ctx, userId);
    const voice = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    const omens = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", userId)).take(20);
    const connected = [];
    for (const p of SOCIAL_PLATFORMS) {
      const c = await byUserPlatform(ctx, userId, p);
      connected.push({ platform: p, status: c ? (c.status === "expired" ? "expired" : "connected") : credsFor(p) ? "not connected" : "coming soon", delivery: modeFor(p, c) });
    }
    return {
      profile: { displayName: user.displayName ?? null, publicProfile: !!user.profilePublic, bio: user.bio ?? null },
      reading: { summaryLanguage: user.summaryLanguage ?? "English", timezone: safeZone(user.timezone), morningSeanceHour: user.briefingHour ?? 7 },
      privacy: { privateMode: user.privateMode ?? false, learningOff: user.learningOff ?? false },
      interests: user.interests,
      voice: voice ? { tone: voice.tone, audience: voice.audience, wordsToUse: voice.wordsToUse, wordsToAvoid: voice.wordsToAvoid, samplePosts: voice.samplePosts } : null,
      omens: omens.map((o) => ({ id: o._id, topic: o.topic, strict: o.strict, muted: o.muted })),
      connectedAccounts: connected,
      notStoredOnServer: {
        theme: "light or dark is kept in the user's own browser",
        notifications: "Necro has no notification settings yet",
        defaultPostPlatforms: "Necro has no default platforms; each post names its platforms",
      },
    };
  },
});

/** list_mcp_access: the user's MCP keys and connected apps. Names, scope, dates. Never a key value or hash. */
export const access = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const user = await userOf(ctx, userId);
    const tz = safeZone(user.timezone);
    const t = (ms?: number) => (ms ? zonedFor(ms, tz) : null);
    const keys = await ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
    const grants = await ctx.db.query("mcpGrants").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
    return {
      note: "Keys and connections can only be created, revoked or deleted by the user in Necro Settings, never through MCP.",
      apiKeys: keys.map((k) => ({
        name: k.name, label: `necro_sk_${k.prefix}…`, scope: k.scope === "write" ? "read and write" : "read only",
        status: k.revokedAt ? "revoked" : k.expiresAt && k.expiresAt <= Date.now() ? "expired" : "active",
        createdAt: t(k._creationTime), lastUsedAt: t(k.lastUsedAt), expiresAt: t(k.expiresAt), thisOne: k._id === keyId,
      })),
      connectedApps: grants.map((g) => ({
        name: g.clientName, label: grantLabel(g._id), scope: g.scope === "write" ? "read and write" : "read only",
        status: g.revokedAt ? "revoked" : g.expiresAt <= Date.now() ? "expired" : "active",
        createdAt: t(g.createdAt), lastUsedAt: t(g.lastUsedAt), thisOne: g._id === keyId,
      })),
    };
  },
});

// ================================================================ read: analytics (per day, in the user's zone)

export const analytics = query({
  args: { ...keyed, days: v.number() },
  handler: async (ctx, { secret, userId, keyId, days: n }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const user = await userOf(ctx, userId);
    const tz = safeZone(user.timezone);
    const now = Date.now();
    const count = Math.min(Math.max(Math.round(n), 1), 90);
    const days = lastDays(count, now, tz);
    const index = new Map(days.map((d, i) => [d, i]));
    const start = now - (count + 1) * DAY; // a little wider than the window; days outside it are dropped
    const zero = () => days.map(() => 0);
    const at = (ms: number) => index.get(localDay(ms, tz));
    let truncated = false;

    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(300);
    const feedTitle = new Map(graves.map((g) => [g._id as string, g.customTitle ?? g.title]));

    const newArticles = zero();
    const perFeed = new Map<string, number>();
    const risen = await ctx.db.query("kindredIndex").withIndex("by_user_published", (q) => q.eq("userId", userId).gte("publishedAt", start)).take(8000);
    if (risen.length === 8000) truncated = true;
    for (const r of risen) {
      const i = at(r.publishedAt);
      if (i === undefined) continue;
      newArticles[i]++;
      perFeed.set(r.graveId, (perFeed.get(r.graveId) ?? 0) + 1);
    }

    const read = zero();
    for (const r of await ctx.db.query("readDays").withIndex("by_user_day", (q) => q.eq("userId", userId).gte("day", days[0])).take(100)) {
      const i = index.get(r.day);
      if (i !== undefined) read[i] += r.count;
    }

    const seances = zero();
    const scoreSum = zero();
    const seanceRows = await ctx.db.query("seances").withIndex("by_user", (q) => q.eq("userId", userId).gte("_creationTime", start)).take(5000);
    if (seanceRows.length === 5000) truncated = true;
    for (const s of seanceRows) {
      const i = at(s._creationTime);
      if (i === undefined) continue;
      seances[i]++;
      scoreSum[i] += s.score;
    }

    const posted = zero();
    const scheduled = zero();
    const failed = zero();
    const perPlatform = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, { posted: 0, scheduled: 0, failed: 0, reminders: 0 }])) as Record<SocialPlatform, { posted: number; scheduled: number; failed: number; reminders: number }>;
    for (const p of await ctx.db.query("publishes").withIndex("by_user_at", (q) => q.eq("userId", userId).gte("at", start)).take(3000)) {
      const i = at(p.at ?? p.createdAt);
      if (i === undefined) continue;
      const tally = perPlatform[p.platform];
      if (p.status === "posted") { posted[i]++; tally.posted++; }
      else if (p.status === "scheduled" || p.status === "due") { scheduled[i]++; tally.scheduled++; }
      else if (p.status === "failed") { failed[i]++; tally.failed++; }
      if (p.mode === "reminder") tally.reminders++;
    }

    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return {
      range: `${count}d`,
      timeZone: tz,
      days,
      series: {
        newArticles,
        articlesRead: read,
        seancesHeld: seances,
        averageRelevance: seances.map((c, i) => (c ? Math.round(scoreSum[i] / c) : null)),
        postsPosted: posted,
        postsScheduled: scheduled,
        postsFailed: failed,
      },
      totals: {
        newArticles: sum(newArticles),
        articlesRead: sum(read),
        seancesHeld: sum(seances),
        averageRelevance: sum(seances) ? Math.round(sum(scoreSum) / sum(seances)) : null,
        postsPosted: sum(posted),
        postsScheduled: sum(scheduled),
        postsFailed: sum(failed),
      },
      perFeed: [...perFeed].map(([graveId, n]) => ({ graveId, feed: feedTitle.get(graveId) ?? "(removed feed)", newArticles: n })).sort((a, b) => b.newArticles - a.newArticles),
      perPlatform,
      notes: [
        "articlesRead counts reads from 26 Nov 2026 on (older reads were not recorded per day).",
        ...(truncated ? ["Very busy account: the oldest days may be undercounted."] : []),
      ],
    };
  },
});

// ================================================================ read: folders, filtered articles

export const folders = query({
  args: keyed,
  handler: async (ctx, { secret, userId, keyId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const rows = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(300);
    const map = new Map<string, { id: string; title: string }[]>();
    for (const g of rows) if (g.folder) map.set(g.folder, [...(map.get(g.folder) ?? []), { id: g._id, title: g.customTitle ?? g.title }]);
    return {
      folders: [...map].map(([name, feeds]) => ({ name, count: feeds.length, feeds })).sort((a, b) => a.name.localeCompare(b.name)),
      notInAFolder: rows.filter((g) => !g.folder).length,
    };
  },
});

/** list_items with a date range, a minimum relevance score and/or a folder (one page, up to 50). */
export const itemsFiltered = query({
  args: {
    ...keyed,
    filter: v.union(v.literal("all"), v.literal("unread"), v.literal("starred")),
    graveId: v.optional(v.string()),
    folder: v.optional(v.string()),
    minScore: v.optional(v.number()),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    limit: v.number(),
  },
  handler: async (ctx, a) => {
    await liveKey(ctx, a.secret, a.userId, a.keyId, false);
    const limit = Math.min(Math.max(a.limit, 1), 50);
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", a.userId)).take(300);
    const titles = new Map(graves.map((g) => [g._id as string, g.customTitle ?? g.title]));
    let allowed: Set<string> | null = null;
    if (a.graveId) allowed = new Set([(await requireOwned(ctx, a.userId, idOf(ctx, "graves", a.graveId)))._id as string]);
    const folder = a.folder?.trim();
    if (folder !== undefined) {
      const f = graves.filter((g) => (g.folder ?? "") === folder).map((g) => g._id as string);
      allowed = allowed ? new Set([...allowed].filter((x) => f.includes(x))) : new Set(f);
    }
    const from = a.fromMs ?? 0;
    const to = a.toMs ?? Number.MAX_SAFE_INTEGER;
    // Scored articles come from the score index (best first); otherwise newest first in the date range.
    const source =
      a.minScore !== undefined
        ? ctx.db.query("items").withIndex("by_user_score", (q) => q.eq("userId", a.userId).gte("score", a.minScore!)).order("desc")
        : ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", a.userId).gte("publishedAt", from).lte("publishedAt", to)).order("desc");
    const out = [];
    let scanned = 0;
    for await (const i of source) {
      if (++scanned > 400) break; // keep the read small; narrow the filters to reach older articles
      if (i.publishedAt < from || i.publishedAt > to) continue;
      if (allowed && !allowed.has(i.graveId)) continue;
      if (a.filter === "unread" && i.isRead) continue;
      if (a.filter === "starred" && !i.isStarred) continue;
      out.push({ id: i._id, title: i.title, feed: titles.get(i.graveId) ?? null, folder: graves.find((g) => g._id === i.graveId)?.folder ?? null, publishedAt: new Date(i.publishedAt).toISOString(), score: i.score ?? null, isRead: i.isRead, isStarred: i.isStarred, source: UNTRUSTED });
      if (out.length >= limit) break;
    }
    return { items: out, nextCursor: null, note: out.length >= limit ? "More may match: narrow the date range or raise minScore." : null };
  },
});

// ================================================================ write: articles

export const setRead = mutation({
  args: { ...keyed, itemId: v.string(), read: v.boolean() },
  handler: (ctx, a) =>
    write(ctx, a, a.read ? "mark_read" : "mark_unread", async () => {
      await setReadFor(ctx, a.userId, idOf(ctx, "items", a.itemId), a.read);
      return { itemId: a.itemId, isRead: a.read };
    }),
});

export const setStar = mutation({
  args: { ...keyed, itemId: v.string(), starred: v.boolean() },
  handler: (ctx, a) =>
    write(ctx, a, a.starred ? "star" : "unstar", async () => {
      await setStarredFor(ctx, a.userId, idOf(ctx, "items", a.itemId), a.starred);
      return { itemId: a.itemId, isStarred: a.starred };
    }),
});

export const markAllRead = mutation({
  args: { ...keyed, graveId: v.optional(v.string()), confirm: v.optional(v.boolean()) },
  handler: (ctx, a) =>
    write(ctx, a, "mark_all_read", async () => {
      needConfirm(a.confirm, a.graveId ? "mark every article in this feed as read" : "mark EVERY unread article as read");
      const graveId = a.graveId ? idOf(ctx, "graves", a.graveId) : undefined;
      if (graveId) await requireOwned(ctx, a.userId, graveId);
      const done = await markAllReadBatch(ctx, a.userId, graveId);
      return { markedNow: done, more: done === 500 ? "The rest are being marked in the background." : null };
    }),
});

// ================================================================ write: feeds

export const updateGrave = mutation({
  args: { ...keyed, graveId: v.string(), title: v.optional(v.string()), folder: v.optional(v.union(v.string(), v.null())) },
  handler: (ctx, a) =>
    write(ctx, a, "update_grave", async () => {
      const id = idOf(ctx, "graves", a.graveId);
      if (a.title === undefined && a.folder === undefined) fail("INVALID_INPUT", "Give a new title and/or folder.");
      if (a.title !== undefined) await renameFor(ctx, a.userId, id, a.title);
      if (a.folder !== undefined) await moveFor(ctx, a.userId, id, a.folder ?? undefined);
      const g = (await ctx.db.get(id))!;
      return { id, title: g.customTitle ?? g.title, folder: g.folder ?? null };
    }),
});

/** Folders in Necro are names on feeds: a folder exists while at least one feed is in it. */
export const createFolder = mutation({
  args: { ...keyed, name: v.string(), graveIds: v.array(v.string()) },
  handler: (ctx, a) =>
    write(ctx, a, "create_folder", async () => {
      const name = a.name.trim();
      if (!name) fail("INVALID_INPUT", "Give the folder a name.");
      if (!a.graveIds.length) fail("INVALID_INPUT", "A folder needs at least one feed: give the graveIds to put in it.");
      if (a.graveIds.length > 100) fail("INVALID_INPUT", "Move up to 100 feeds at a time.");
      for (const g of a.graveIds) await moveFor(ctx, a.userId, idOf(ctx, "graves", g), name);
      return { folder: name, moved: a.graveIds.length };
    }),
});

export const removeGrave = mutation({
  args: { ...keyed, graveId: v.string(), confirm: v.optional(v.boolean()) },
  handler: (ctx, a) =>
    write(ctx, a, "remove_grave", async () => {
      const id = idOf(ctx, "graves", a.graveId);
      const g = await requireOwned(ctx, a.userId, id);
      needConfirm(a.confirm, `unsubscribe from "${g.customTitle ?? g.title}" and delete its articles`);
      await layToRestFor(ctx, a.userId, id);
      return { removed: g.customTitle ?? g.title };
    }),
});

/** Check a feed again now (the same reset as the Feed Doctor's retry). */
export const refreshGrave = mutation({
  args: { ...keyed, graveId: v.string() },
  handler: (ctx, a) =>
    write(ctx, a, "refresh_grave", async () => {
      const id = idOf(ctx, "graves", a.graveId);
      await requireOwned(ctx, a.userId, id);
      await ctx.runMutation(internal.graves.resetForRetry, { graveId: id });
      await ctx.scheduler.runAfter(0, internal.feedsNode.fetchOne, { graveId: id });
      return { graveId: id, note: "Checking now. Call get_grave in a few seconds for the result." };
    }),
});

// ================================================================ write: interests, voice, omens, settings

export const setInterests = mutation({
  args: { ...keyed, interests: v.array(v.string()) },
  handler: (ctx, a) => write(ctx, a, "set_interests", async () => ({ interests: await setInterestsFor(ctx, a.userId, a.interests) })),
});

export const setVoice = mutation({
  args: {
    ...keyed,
    tone: v.optional(v.string()),
    audience: v.optional(v.string()),
    wordsToUse: v.optional(v.array(v.string())),
    wordsToAvoid: v.optional(v.array(v.string())),
    samplePosts: v.optional(v.array(v.string())),
  },
  handler: (ctx, a) =>
    write(ctx, a, "set_voice", async () => {
      const cur = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", a.userId)).first();
      return await saveVoiceFor(ctx, a.userId, {
        tone: a.tone ?? cur?.tone ?? "",
        audience: a.audience ?? cur?.audience ?? "",
        wordsToUse: a.wordsToUse ?? cur?.wordsToUse ?? [],
        wordsToAvoid: a.wordsToAvoid ?? cur?.wordsToAvoid ?? [],
        samplePosts: a.samplePosts ?? cur?.samplePosts ?? [],
      });
    }),
});

export const setOmens = mutation({
  args: { ...keyed, add: v.optional(v.array(v.string())), remove: v.optional(v.array(v.string())), strict: v.optional(v.boolean()) },
  handler: (ctx, a) =>
    write(ctx, a, "set_omens", async () => {
      if (!a.add?.length && !a.remove?.length) fail("INVALID_INPUT", "Give topics to add and/or remove.");
      const mine = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", a.userId)).take(50);
      const removed: string[] = [];
      for (const r of a.remove ?? []) {
        const o = mine.find((x) => x._id === r || x.topic.toLowerCase() === r.trim().toLowerCase());
        if (!o) fail("NOT_FOUND", `You don't watch "${r.slice(0, 60)}".`);
        await removeOmenFor(ctx, a.userId, o._id);
        removed.push(o.topic);
      }
      const added: string[] = [];
      for (const t of a.add ?? []) {
        await createOmenFor(ctx, a.userId, t, a.strict);
        added.push(t.trim());
      }
      const now = await ctx.db.query("omens").withIndex("by_user", (q) => q.eq("userId", a.userId)).take(50);
      return { added, removed, watching: now.map((o) => o.topic) };
    }),
});

export const updateSettings = mutation({
  args: {
    ...keyed,
    summaryLanguage: v.optional(v.string()),
    timezone: v.optional(v.string()),
    morningSeanceHour: v.optional(v.number()),
    displayName: v.optional(v.string()),
    privateMode: v.optional(v.boolean()),
  },
  handler: (ctx, a) =>
    write(ctx, a, "update_settings", async () => {
      if ([a.summaryLanguage, a.timezone, a.morningSeanceHour, a.displayName, a.privateMode].every((x) => x === undefined)) {
        fail("INVALID_INPUT", "Nothing to change.");
      }
      await setPreferencesFor(ctx, a.userId, { summaryLanguage: a.summaryLanguage, timezone: a.timezone, briefingHour: a.morningSeanceHour });
      if (a.displayName !== undefined) await setDisplayNameFor(ctx, a.userId, a.displayName);
      if (a.privateMode !== undefined) await ctx.db.patch(a.userId, { privateMode: a.privateMode });
      const u = await userOf(ctx, a.userId);
      return { summaryLanguage: u.summaryLanguage ?? "English", timezone: safeZone(u.timezone), morningSeanceHour: u.briefingHour ?? 7, displayName: u.displayName ?? null, privateMode: u.privateMode ?? false };
    }),
});

// ================================================================ posts: draft → confirm → schedule / publish

/** How each platform would deliver this post right now, said plainly (never pretend a reminder is a post). */
async function deliveryFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">, platform: SocialPlatform, imageType?: string) {
  const conn = await byUserPlatform(ctx, userId, platform);
  let mode = modeFor(platform, conn);
  if (platform === "instagram" && mode === "auto" && imageType !== "image/jpeg") mode = "reminder";
  const comingSoon = !credsFor(platform);
  const note =
    mode === "auto"
      ? `Necro posts this to ${NAMES[platform]} on its own.`
      : comingSoon
        ? `${NAMES[platform]} posting is coming soon in Necro. This will NOT be posted automatically: the user gets a reminder to share it themselves.`
        : platform === "tiktok"
          ? "TikTok always works as a reminder: the user shares it from their phone."
          : conn?.status === "active"
            ? `${NAMES[platform]} needs a JPEG photo to post on its own; with this image it is a reminder the user shares themselves.`
            : `${NAMES[platform]} is not connected, so this is a reminder the user shares themselves (connect it in Settings to post automatically).`;
  return { platform, delivery: mode, deliveryNote: note };
}

async function draftView(ctx: QueryCtx | MutationCtx, d: Doc<"postDrafts">) {
  const user = await userOf(ctx, d.userId);
  const up = d.imageId ? await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", d.imageId!)).unique() : null;
  const item = d.itemId ? await ctx.db.get(d.itemId) : null;
  const perPlatform = [];
  for (const p of d.platforms) {
    perPlatform.push({ ...(await deliveryFor(ctx, d.userId, p, up?.contentType)), characters: postLength(p, d.text), limit: POST_LIMITS[p] });
  }
  return {
    postId: d._id,
    status: d.status === "draft" ? ("draft" as const) : d.status === "queued" ? ("queued" as const) : ("discarded" as const),
    queuedPostId: d.postId ?? null,
    text: d.text,
    image: d.imageId ? { imageId: d.imageId, previewUrl: await ctx.storage.getUrl(d.imageId) } : null,
    sourceItem: item ? { id: item._id, title: item.title, link: item.link ?? null, source: UNTRUSTED } : null,
    perPlatform,
    updatedAt: zonedFor(d.updatedAt, safeZone(user.timezone)),
    next:
      d.status === "draft"
        ? "Nothing is published yet. Show the user this exact text and image (get_page_image page 'post-preview' shows how it will look), " +
          "wait for their OK, then call schedule_post (a time) or publish_post (now, confirm: true)."
        : null,
  };
}

function draftIdOf(ctx: QueryCtx | MutationCtx, postId: string): Id<"postDrafts"> | null {
  return ctx.db.normalizeId("postDrafts", postId);
}

async function ownedDraft(ctx: QueryCtx | MutationCtx, userId: Id<"users">, id: Id<"postDrafts">) {
  const d = await ctx.db.get(id);
  if (!d || d.userId !== userId) fail("NOT_FOUND", "No post with that id. Get ids from list_posts or draft_post.");
  return d;
}

/** Text and image rules for a draft, with the same messages the queue would give (so nothing fails later). */
async function checkDraft(ctx: MutationCtx, userId: Id<"users">, text: string, platforms: SocialPlatform[], imageId?: Id<"_storage">) {
  if (!platforms.length) fail("INVALID_INPUT", "Pick at least one platform: linkedin, x, instagram or tiktok.");
  checkText(text, platforms);
  for (const p of platforms) if ((p === "instagram" || p === "tiktok") && !imageId) fail("INVALID_INPUT", `${NAMES[p]} needs an image. Upload one with upload_post_image.`);
  void userId;
}

export const draftPost = mutation({
  args: { ...keyed, text: v.string(), platforms: v.array(socialPlatform), imageId: v.optional(v.string()), sourceItemId: v.optional(v.string()) },
  handler: (ctx, a) =>
    write(
      ctx,
      a,
      "draft_post",
      async () => {
        const platforms = [...new Set(a.platforms)];
        const imageId = await ownedImage(ctx, a.userId, a.imageId);
        await checkDraft(ctx, a.userId, a.text, platforms, imageId);
        const itemId = await ownedItem(ctx, a.userId, a.sourceItemId);
        const recent = await ctx.db.query("postDrafts").withIndex("by_user", (q) => q.eq("userId", a.userId).gte("createdAt", Date.now() - DAY)).take(101);
        if (recent.length > 100) fail("LIMIT", "Up to 100 drafts a day.");
        const now = Date.now();
        const id = await ctx.db.insert("postDrafts", { userId: a.userId, keyId: a.keyId, text: a.text.trim(), platforms, imageId, itemId, status: "draft", createdAt: now, updatedAt: now });
        return await draftView(ctx, (await ctx.db.get(id))!);
      },
      (r) => r.postId,
    ),
});

/** Queue a draft through the app's composer (social.composeFor): now (at undefined) or at a time. */
async function queueDraft(ctx: MutationCtx, k: K, keyLabel: string, d: Doc<"postDrafts">, at: number | undefined) {
  if (d.status === "queued" && d.postId) return await postView(ctx, await groupRows(ctx, k.userId, d.postId)); // retried call: same post
  if (d.status === "discarded") fail("INVALID_INPUT", "This draft was cancelled. Make a new one with draft_post.");
  await countPosts(ctx, k.keyId, d.platforms.length);
  const user = await userOf(ctx, k.userId);
  const res = await composeFor(ctx, user, { caption: d.text, platforms: d.platforms, storageId: d.imageId, at }, `mcp:${keyLabel}`, { itemId: d.itemId, idemKey: `draft:${d._id}` });
  const postId = res[0].publishId as string;
  await ctx.db.patch(d._id, { status: "queued", postId, updatedAt: Date.now() });
  return await postView(ctx, await groupRows(ctx, k.userId, postId));
}

export const schedulePost = mutation({
  args: { ...keyed, postId: v.string(), atIso: v.string() },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    const draftId = draftIdOf(ctx, a.postId);
    let view;
    if (draftId) {
      view = await queueDraft(ctx, a, key.prefix, await ownedDraft(ctx, a.userId, draftId), scheduleMs(a.atIso)!);
    } else {
      // Already queued: move it (the same edit as update_post with only a time).
      view = await updateQueuedFor(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix }, { postId: a.postId, atIso: a.atIso });
    }
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix, tool: "schedule_post", postId: view.postId, status: "ok", message: a.atIso.slice(0, 40) });
    return { ...view, scheduledFrom: draftId ? a.postId : null, note: "Scheduled. Necro's scheduler sends it at that minute; call get_post afterwards for the live link." };
  },
});

export const publishPost = mutation({
  args: { ...keyed, postId: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    needConfirm(a.confirm, "publish this post now to the user's real accounts (show them the final text and image first)");
    const draftId = draftIdOf(ctx, a.postId);
    let view;
    if (draftId) view = await queueDraft(ctx, a, key.prefix, await ownedDraft(ctx, a.userId, draftId), undefined);
    else {
      const rows = await groupRows(ctx, a.userId, a.postId);
      await publishNowFor(ctx, rows);
      view = await postView(ctx, await groupRows(ctx, a.userId, a.postId));
    }
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix, tool: "publish_post", postId: view.postId, status: "ok" });
    return { ...view, note: "Sending now. Call get_post in a few seconds for the result and the live link (liveUrl)." };
  },
});

/** update_post for a draft (any field) or a queued post (only while scheduled). */
export const updatePost = mutation({
  args: { ...keyed, postId: v.string(), text: v.optional(v.string()), imageId: v.optional(v.string()), platforms: v.optional(v.array(socialPlatform)), atIso: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    if (a.text === undefined && a.imageId === undefined && a.platforms === undefined && a.atIso === undefined) fail("INVALID_INPUT", "Nothing to change: give text, imageId, platforms or scheduleAt.");
    const draftId = draftIdOf(ctx, a.postId);
    let view;
    if (draftId) {
      const d = await ownedDraft(ctx, a.userId, draftId);
      if (d.status !== "draft") fail("INVALID_INPUT", d.status === "queued" ? `This draft is already queued as post ${d.postId}. Update that postId instead.` : "This draft was cancelled.");
      if (a.atIso !== undefined) fail("INVALID_INPUT", "A draft has no time yet: use schedule_post to pick one.");
      const platforms = a.platforms ? [...new Set(a.platforms)] : d.platforms;
      const imageId = a.imageId !== undefined ? await ownedImage(ctx, a.userId, a.imageId) : d.imageId;
      const text = a.text?.trim() ?? d.text;
      await checkDraft(ctx, a.userId, text, platforms, imageId);
      await ctx.db.patch(d._id, { text, platforms, imageId, updatedAt: Date.now() });
      view = await draftView(ctx, (await ctx.db.get(d._id))!);
    } else {
      view = await updateQueuedFor(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix }, a);
    }
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix, tool: a.atIso && !a.text && !a.platforms && !a.imageId ? "reschedule_post" : "update_post", postId: view.postId, status: "ok" });
    return view;
  },
});

export const cancelPost = mutation({
  args: { ...keyed, postId: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    needConfirm(a.confirm, "cancel this post");
    const draftId = draftIdOf(ctx, a.postId);
    let out;
    if (draftId) {
      const d = await ownedDraft(ctx, a.userId, draftId);
      if (d.status === "queued") fail("INVALID_INPUT", `This draft is already queued as post ${d.postId}. Cancel that postId instead.`);
      await ctx.db.patch(d._id, { status: "discarded", updatedAt: Date.now() });
      out = { postId: d._id, status: "canceled" as const, perPlatform: [] };
    } else {
      const rows = await groupRows(ctx, a.userId, a.postId);
      await cancelGroupFor(ctx, a.userId, rows);
      const view = await postView(ctx, await groupRows(ctx, a.userId, a.postId));
      out = { postId: view.postId, status: "canceled" as const, perPlatform: view.perPlatform };
    }
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix, tool: "cancel_post", postId: out.postId, status: "ok" });
    return out;
  },
});

/** Send a failed post again (the failed accounts only), now. Failed posts never block "one post, once". */
export const retryPost = mutation({
  args: { ...keyed, postId: v.string() },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    const rows = await groupRows(ctx, a.userId, a.postId);
    const failed = rows.filter((r) => r.status === "failed");
    if (!failed.length) fail("INVALID_INPUT", "Only failed posts can be retried. This post has no failed account.");
    if (failed.some((r) => r.kind !== "manual")) fail("INVALID_INPUT", "This post came from an article draft: retry it from Witching Hour in Necro.");
    await countPosts(ctx, a.keyId, failed.length);
    const res = await composeFor(ctx, await userOf(ctx, a.userId), { caption: failed[0].text ?? "", platforms: failed.map((r) => r.platform), storageId: failed[0].imageId }, `mcp:${key.prefix}`, { itemId: failed[0].itemId });
    const view = await postView(ctx, await groupRows(ctx, a.userId, res[0].publishId));
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: key.prefix, tool: "retry_post", postId: view.postId, status: "ok", message: `retry of ${a.postId}`.slice(0, 200) });
    return { ...view, retriedFrom: a.postId, note: "Sending again now. Call get_post in a few seconds for the result." };
  },
});

/** get_post for any id: a draft (not queued yet) or a queued post. */
export const getPost = query({
  args: { ...keyed, postId: v.string() },
  handler: async (ctx, { secret, userId, keyId, postId }) => {
    await liveKey(ctx, secret, userId, keyId, false);
    const draftId = draftIdOf(ctx, postId);
    if (draftId) {
      const d = await ownedDraft(ctx, userId, draftId);
      if (d.status === "queued" && d.postId) return { ...(await postView(ctx, await groupRows(ctx, userId, d.postId))), fromDraft: d._id };
      return await draftView(ctx, d);
    }
    return await postView(ctx, await groupRows(ctx, userId, postId));
  },
});

/** list_posts with filters: status (draft too), platform, date range. Newest first. */
export const listPosts = query({
  args: {
    ...keyed,
    status: v.optional(v.union(v.literal("draft"), v.literal("scheduled"), v.literal("due"), v.literal("posting"), v.literal("posted"), v.literal("failed"), v.literal("canceled"))),
    platform: v.optional(socialPlatform),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    limit: v.number(),
  },
  handler: async (ctx, a) => {
    await liveKey(ctx, a.secret, a.userId, a.keyId, false);
    const user = await userOf(ctx, a.userId);
    const tz = safeZone(user.timezone);
    const limit = Math.min(Math.max(a.limit, 1), 50);
    const now = Date.now();
    if (a.status === "draft") {
      const drafts = await ctx.db.query("postDrafts").withIndex("by_user", (q) => q.eq("userId", a.userId)).order("desc").take(200);
      return drafts
        .filter((d) => d.status === "draft" && (!a.platform || d.platforms.includes(a.platform)) && d.createdAt >= (a.fromMs ?? 0) && d.createdAt <= (a.toMs ?? Infinity))
        .slice(0, limit)
        .map((d) => ({ postId: d._id, status: "draft", platforms: d.platforms, text: d.text.slice(0, 300), hasImage: !!d.imageId, createdAt: zonedFor(d.createdAt, tz) }));
    }
    const from = a.fromMs ?? now - 30 * DAY;
    const to = a.toMs ?? now + 90 * DAY;
    const out = [];
    for await (const r of ctx.db.query("publishes").withIndex("by_user_at", (q) => q.eq("userId", a.userId).gte("at", from).lte("at", to)).order("desc")) {
      if (a.status && r.status !== a.status) continue;
      if (a.platform && r.platform !== a.platform) continue;
      out.push({
        postId: r.groupId ?? r._id, publishId: r._id, platform: r.platform, status: r.status, delivery: r.mode ?? "auto",
        at: zonedFor(r.at ?? r.createdAt, tz), text: (r.text ?? "").slice(0, 300), hasImage: !!r.imageId, liveUrl: r.url ?? null, error: r.error ?? null,
        createdBy: r.via ? "ai-assistant" : "app",
      });
      if (out.length >= limit) break;
    }
    return out;
  },
});

// ---------- generate_post_from_item: AI drafts in the user's voice, saved as an MCP draft (never published) ----------

export const startGenerate = mutation({
  args: { ...keyed, itemId: v.string() },
  handler: async (ctx, a) => {
    const key = await writeKey(ctx, a.secret, a.userId, a.keyId);
    const id = idOf(ctx, "items", a.itemId);
    await requireOwned(ctx, a.userId, id);
    return { itemId: id, keyLabel: key.prefix };
  },
});

export const saveGenerated = mutation({
  args: { ...keyed, itemId: v.id("items"), platform: socialPlatform, text: v.string(), keyLabel: v.string() },
  handler: async (ctx, a) => {
    await liveKey(ctx, a.secret, a.userId, a.keyId, true);
    await requireOwned(ctx, a.userId, a.itemId); // only ever the caller's own article
    if (a.text.length > 4000) fail("INVALID_INPUT", "The generated post is too long.");
    const now = Date.now();
    const id = await ctx.db.insert("postDrafts", { userId: a.userId, keyId: a.keyId, text: a.text, platforms: [a.platform], itemId: a.itemId, status: "draft", createdAt: now, updatedAt: now });
    await audit(ctx, { userId: a.userId, keyId: a.keyId, keyLabel: a.keyLabel, tool: "generate_post_from_item", postId: id, status: "ok" });
    return await draftView(ctx, (await ctx.db.get(id))!);
  },
});

export const generatePostFromItem = action({
  args: { ...keyed, itemId: v.string(), platform: socialPlatform },
  handler: async (ctx, a): Promise<Record<string, unknown>> => {
    const { itemId, keyLabel } = await ctx.runMutation(api.mcpAgent.startGenerate, { secret: a.secret, userId: a.userId, keyId: a.keyId, itemId: a.itemId });
    const drafts: DraftView[] = await ctx.runAction(internal.aiNode.resurrectInternal, { userId: a.userId, itemId });
    // Resurrect writes LinkedIn, X and Instagram versions; TikTok captions use the Instagram one.
    const want = a.platform === "tiktok" ? "instagram" : a.platform;
    const pick = drafts.find((d) => d.platform === want) ?? drafts[0];
    const text = [pick.text, pick.hashtags.length ? pick.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : ""].filter(Boolean).join("\n\n");
    const fitted = text.length > POST_LIMITS[a.platform] ? pick.text : text;
    return {
      ...(await ctx.runMutation(api.mcpAgent.saveGenerated, { secret: a.secret, userId: a.userId, keyId: a.keyId, platform: a.platform, itemId, text: fitted, keyLabel })),
      writtenBy: pick.ghost ? "template (no AI model answered)" : pick.model,
    };
  },
});

// ---------- the post-preview page (signed-in user, the app's own auth) ----------

/** What /calendar/preview draws: a draft or a queued post of the signed-in user. Null when not theirs. */
export const previewForPage = query({
  args: { postId: v.string() },
  handler: async (ctx, { postId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const draftId = draftIdOf(ctx, postId);
    let text: string, platforms: SocialPlatform[], imageId: Id<"_storage"> | undefined, itemId: Id<"items"> | undefined, status: string;
    if (draftId) {
      const d = await ctx.db.get(draftId);
      if (!d || d.userId !== user._id) return null;
      ({ text, platforms, imageId, itemId } = d);
      status = d.status === "draft" ? "draft" : d.status;
    } else {
      const rows = await ctx.db.query("publishes").withIndex("by_user_group", (q) => q.eq("userId", user._id).eq("groupId", postId)).take(10);
      const id = ctx.db.normalizeId("publishes", postId);
      const one = !rows.length && id ? await ctx.db.get(id) : null;
      const all = rows.length ? rows : one && one.userId === user._id ? [one] : [];
      if (!all.length) return null;
      text = all[0].text ?? "";
      platforms = all.map((r) => r.platform);
      imageId = all[0].imageId;
      itemId = all[0].itemId;
      status = all[0].status;
    }
    const item = itemId ? await ctx.db.get(itemId) : null;
    const grave = item ? await ctx.db.get(item.graveId) : null;
    const delivery = [];
    for (const p of platforms) delivery.push(await deliveryFor(ctx, user._id, p, imageId ? (await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", imageId!)).unique())?.contentType : undefined));
    return {
      status,
      text,
      platforms,
      imageUrl: imageId ? await ctx.storage.getUrl(imageId) : null,
      article: item ? { title: item.title, link: item.link, source: grave ? (grave.customTitle ?? grave.title) : "" } : null,
      author: { name: user.displayName ?? user.name ?? "You" },
      delivery,
      day: utcDay(),
    };
  },
});
