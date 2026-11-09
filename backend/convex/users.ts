import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fail, getCurrentUser, requireUser } from "./lib/auth";
import { usageToday } from "./aiUsage";
import { removeCollection } from "./covens";

async function upsertCaller(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED", "Please sign in.");

  const existing = await getCurrentUser(ctx);
  if (existing) {
    if (existing.name !== identity.name || existing.email !== identity.email) {
      await ctx.db.patch(existing._id, { name: identity.name, email: identity.email });
    }
    return existing._id;
  }

  return await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    clerkId: identity.subject,
    name: identity.name,
    email: identity.email,
    interests: [],
    createdAt: Date.now(),
  });
}

/** Create or refresh the caller's user record. Called once after sign-in (ConvexClientProvider). */
export const store = mutation({ args: {}, handler: (ctx) => upsertCaller(ctx) });

/** Same as `store`; the name the build prompt uses. */
export const ensure = mutation({ args: {}, handler: (ctx) => upsertCaller(ctx) });

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      interests: user.interests,
      summaryLanguage: user.summaryLanguage ?? "English",
      displayName: user.displayName ?? null,
      onboarded: user.onboardedAt !== undefined,
      usage: await usageToday(ctx, user._id),
    };
  },
});

export const ensureSignedIn = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return true;
  },
});

export const setInterests = mutation({
  args: { interests: v.array(v.string()) },
  handler: async (ctx, { interests }) => {
    const user = await requireUser(ctx);
    const clean = [...new Set(interests.map((s) => s.trim()).filter(Boolean))];
    if (clean.length < 1 || clean.length > 20 || clean.some((s) => s.length > 40)) {
      fail("INVALID_INPUT", "Add 1 to 20 interests, each up to 40 characters.");
    }
    await ctx.db.patch(user._id, { interests: clean });
  },
});

/** Public name shown on collections you publish. Empty resets to "A Necro reader". Never your email. */
export const setDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const user = await requireUser(ctx);
    const name = displayName.replace(/\s+/g, " ").trim();
    if (name.length > 40) fail("INVALID_INPUT", "Display names can be up to 40 characters.");
    if (/@/.test(name)) fail("INVALID_INPUT", "Use a name, not an email address.");
    await ctx.db.patch(user._id, { displayName: name || undefined });
  },
});

/** Settings: summary language (multilingual Séance), timezone and Morning Séance hour. */
export const setPreferences = mutation({
  args: {
    summaryLanguage: v.optional(v.string()),
    timezone: v.optional(v.string()),
    briefingHour: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const patch: { summaryLanguage?: string; timezone?: string; briefingHour?: number } = {};
    if (a.summaryLanguage !== undefined) {
      const lang = a.summaryLanguage.trim();
      if (!/^[\p{L} -]{2,30}$/u.test(lang)) fail("INVALID_INPUT", "Pick a language name, like English or Malay.");
      patch.summaryLanguage = lang;
    }
    if (a.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: a.timezone });
      } catch {
        fail("INVALID_INPUT", "That timezone is not recognised.");
      }
      patch.timezone = a.timezone;
    }
    if (a.briefingHour !== undefined) {
      if (!Number.isInteger(a.briefingHour) || a.briefingHour < 0 || a.briefingHour > 23) fail("INVALID_INPUT", "Pick an hour from 0 to 23.");
      patch.briefingHour = a.briefingHour;
    }
    await ctx.db.patch(user._id, patch);
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.onboardedAt === undefined) await ctx.db.patch(user._id, { onboardedAt: Date.now() });
  },
});

/** Internal: resolves the signed-in caller for actions (actions cannot read the db). */
export const currentId = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => (await requireUser(ctx))._id,
});

export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.get(userId),
});

/** Settings danger zone: deletes every row the caller owns, in scheduled batches. */
export const deleteAllData = action({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx): Promise<null> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    await ctx.runMutation(internal.users.deleteBatch, { userId });
    return null;
  },
});

const BATCH = 200;

/** Deletes one batch of the user's rows and reschedules itself until nothing is left. */
export const deleteBatch = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Graves first: each one schedules the deletion of its own items, Séances and drafts.
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
    for (const g of graves) {
      await ctx.db.delete(g._id);
      await ctx.scheduler.runAfter(0, internal.graves.deleteGraveData, { graveId: g._id });
    }
    if (graves.length) {
      await ctx.scheduler.runAfter(0, internal.users.deleteBatch, { userId });
      return;
    }

    // Published collections go too (with their follows), so nothing public outlives the account.
    const collections = await ctx.db.query("collections").withIndex("by_user", (q) => q.eq("userId", userId)).take(20);
    for (const c of collections) await removeCollection(ctx, c._id);
    if (collections.length) {
      await ctx.scheduler.runAfter(0, internal.users.deleteBatch, { userId });
      return;
    }

    const small = [
      await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("aiUsage").withIndex("by_user_day_task", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("voiceSessions").withIndex("by_user_day", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("seances").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("drafts").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("collectionFollows").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("collectionReports").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATCH),
      await ctx.db.query("kindredIndex").withIndex("by_user_published", (q) => q.eq("userId", userId)).take(BATCH),
    ].flat();
    for (const row of small) await ctx.db.delete(row._id);
    if (small.length) {
      await ctx.scheduler.runAfter(0, internal.users.deleteBatch, { userId });
      return;
    }

    // Items are deleted by deleteGraveData; wait until none are left before removing the user.
    const leftover = await ctx.db.query("items").withIndex("by_user_published", (q) => q.eq("userId", userId)).first();
    if (leftover) {
      await ctx.scheduler.runAfter(5_000, internal.users.deleteBatch, { userId });
      return;
    }
    const user = await ctx.db.get(userId);
    if (user) await ctx.db.delete(userId);
  },
});

