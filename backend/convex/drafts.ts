import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { platform } from "./schema";
import { fail, requireOwned, requireUser } from "./lib/auth";
import { cleanHashtags, PLATFORM_LIMITS } from "../lib/prompts";

export type DraftView = {
  _id: Id<"drafts">;
  platform: "linkedin" | "x" | "instagram";
  text: string;
  hashtags: string[];
  status: "draft" | "copied" | "shared";
};

export const update = mutation({
  args: { draftId: v.id("drafts"), text: v.string(), hashtags: v.array(v.string()) },
  handler: async (ctx, { draftId, text, hashtags }) => {
    const user = await requireUser(ctx);
    const d = await requireOwned(ctx, user._id, draftId);
    const max = PLATFORM_LIMITS[d.platform];
    if (text.length > max) fail("INVALID_INPUT", `This draft can be up to ${max} characters.`);
    const tags = cleanHashtags(hashtags);
    if (tags.length > 6 || tags.some((t) => t.length > 60)) fail("INVALID_INPUT", "Use up to 6 hashtags.");
    await ctx.db.patch(draftId, { text, hashtags: tags });
  },
});

export const setStatus = mutation({
  args: { draftId: v.id("drafts"), status: v.union(v.literal("copied"), v.literal("shared")) },
  handler: async (ctx, { draftId, status }) => {
    const user = await requireUser(ctx);
    const d = await requireOwned(ctx, user._id, draftId);
    // "shared" is the furthest state; copying after sharing does not move it back.
    if (d.status === "shared" && status === "copied") return;
    await ctx.db.patch(draftId, { status });
  },
});

/** Everything raiseResurrect needs, owner-checked. */
export const context = internalQuery({
  args: { userId: v.id("users"), itemId: v.id("items") },
  handler: async (ctx, { userId, itemId }) => {
    const item = await requireOwned(ctx, userId, itemId);
    const grave = await ctx.db.get(item.graveId);
    const voice = await ctx.db.query("voice").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    const seance = await ctx.db.query("seances").withIndex("by_item", (q) => q.eq("itemId", itemId)).first();
    const source = grave ? (grave.customTitle ?? grave.title) : "the source";
    return {
      item: { title: item.title, link: item.link ?? grave?.siteUrl ?? "", contentHtml: item.contentHtml, excerpt: item.excerpt },
      source,
      voice: voice
        ? { tone: voice.tone, audience: voice.audience, wordsToUse: voice.wordsToUse, wordsToAvoid: voice.wordsToAvoid, samplePosts: voice.samplePosts }
        : null,
      summary: seance?.summary ?? null,
    };
  },
});

/** Re-raising replaces the item's drafts. Finalises the usage row. */
export const replaceForItem = internalMutation({
  args: {
    userId: v.id("users"),
    itemId: v.id("items"),
    usageId: v.id("aiUsage"),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    drafts: v.array(v.object({ platform, text: v.string(), hashtags: v.array(v.string()) })),
  },
  handler: async (ctx, a): Promise<DraftView[]> => {
    await requireOwned(ctx, a.userId, a.itemId);
    await ctx.db.patch(a.usageId, { model: a.model, inputTokens: a.inputTokens, outputTokens: a.outputTokens });
    for (const old of await ctx.db.query("drafts").withIndex("by_item", (q) => q.eq("itemId", a.itemId)).collect()) {
      if (old.userId === a.userId) await ctx.db.delete(old._id);
    }
    const out: DraftView[] = [];
    for (const d of a.drafts) {
      const _id = await ctx.db.insert("drafts", { userId: a.userId, itemId: a.itemId, ...d, status: "draft", model: a.model });
      out.push({ _id, ...d, status: "draft" });
    }
    return out;
  },
});
