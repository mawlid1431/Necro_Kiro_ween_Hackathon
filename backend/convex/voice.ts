import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getCurrentUser, requireUser } from "./lib/auth";

/** The caller's voice profile (null until saved). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const p = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
    if (!p) return null;
    return { tone: p.tone, audience: p.audience, wordsToUse: p.wordsToUse, wordsToAvoid: p.wordsToAvoid, samplePosts: p.samplePosts };
  },
});

const words = (list: string[]) => [...new Set(list.map((w) => w.trim()).filter(Boolean))];

export const save = mutation({
  args: {
    tone: v.string(),
    audience: v.string(),
    wordsToUse: v.array(v.string()),
    wordsToAvoid: v.array(v.string()),
    samplePosts: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const profile = {
      tone: a.tone.trim(),
      audience: a.audience.trim(),
      wordsToUse: words(a.wordsToUse),
      wordsToAvoid: words(a.wordsToAvoid),
      samplePosts: a.samplePosts.map((s) => s.trim()).filter(Boolean),
    };
    if (profile.tone.length > 200 || profile.audience.length > 200) fail("INVALID_INPUT", "Tone and audience can be up to 200 characters.");
    for (const list of [profile.wordsToUse, profile.wordsToAvoid]) {
      if (list.length > 30 || list.some((w) => w.length > 40)) fail("INVALID_INPUT", "Use up to 30 words, each up to 40 characters.");
    }
    if (profile.samplePosts.length > 3 || profile.samplePosts.some((s) => s.length > 2000)) {
      fail("INVALID_INPUT", "Add up to 3 sample posts, each up to 2000 characters.");
    }
    const existing = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
    if (existing) await ctx.db.patch(existing._id, profile);
    else await ctx.db.insert("voice", { userId: user._id, ...profile });
    return profile;
  },
});
