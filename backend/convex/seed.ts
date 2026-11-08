import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Database side of the seed (seedNode.ts runs the fetching). Internal only: run from the CLI.

const DEMO_CLERK_ID = "seed_demo_user";
const DEMO_INTERESTS = ["ai", "security", "open source", "web development", "science"];

/** The user to seed: by email (must have signed in once), or the built-in demo user. */
export const resolveUser = internalMutation({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, { email }): Promise<{ userId: Id<"users">; label: string; created: boolean }> => {
    if (email) {
      const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.trim())).first();
      if (!user) throw new Error(`No user with email ${email}. Sign in to the app once with that account, then run the seed again.`);
      return { userId: user._id, label: email, created: false };
    }
    const existing = await ctx.db.query("users").withIndex("by_clerk", (q) => q.eq("clerkId", DEMO_CLERK_ID)).first();
    if (existing) return { userId: existing._id, label: "demo user", created: false };
    // Not linked to a Clerk login: reachable through MCP keys and the dashboard only.
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: `seed|${DEMO_CLERK_ID}`,
      clerkId: DEMO_CLERK_ID,
      name: "Necro Demo",
      email: "demo@necro.local",
      interests: DEMO_INTERESTS,
      onboardedAt: Date.now(),
      createdAt: Date.now(),
      isDemo: true,
    });
    return { userId, label: "demo user", created: true };
  },
});

/** Interests and a voice profile, only where the user has none yet (never overwrites). */
export const ensureProfile = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User vanished");
    if (!user.interests.length) await ctx.db.patch(userId, { interests: DEMO_INTERESTS });
    const voice = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (!voice) {
      await ctx.db.insert("voice", {
        userId,
        tone: "curious, clear, a little playful",
        audience: "developers and builders",
        wordsToUse: ["builders", "open web"],
        wordsToAvoid: ["game-changer", "revolutionary", "synergy"],
        samplePosts: ["Read something good today: a clear take on why small, boring tools win. Worth ten minutes."],
      });
    }
  },
});

/** Summary of what a user has, for the seed report. */
export const report = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const graves = await ctx.db.query("graves").withIndex("by_user", (q) => q.eq("userId", userId)).take(300);
    return graves.map((g) => ({ title: g.customTitle ?? g.title, status: g.status, format: g.format ?? "pending", unread: g.unreadCount, error: g.lastErrorCode ?? null }));
  },
});
