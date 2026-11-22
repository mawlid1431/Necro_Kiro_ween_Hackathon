"use node";

// "Write with AI" in the Witching Hour composer: a vision model looks at your uploaded image and writes a
// caption in your saved voice. Private task: the image never goes to a provider that may train on prompts.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ladderObject } from "./lib/ladder";
import { AllRungsFailed } from "../lib/ai/router";
import { CAPTION_SYSTEM, CaptionSchema, captionPrompt, tidyCaption } from "../lib/ai/prompts";

export const writeCaption = action({
  args: { storageId: v.id("_storage"), note: v.optional(v.string()), maxChars: v.optional(v.number()) },
  handler: async (ctx, { storageId, note, maxChars }): Promise<{ caption: string; hashtags: string[] }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const upload = await ctx.runQuery(internal.social.ownedUpload, { userId, storageId });
    if (!upload) throw new ConvexError({ code: "NOT_FOUND", message: "That image could not be found. Upload it again." });
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new ConvexError({ code: "NOT_FOUND", message: "That image could not be found. Upload it again." });
    const voice = await ctx.runQuery(internal.social.voiceOf, { userId });

    const usageId = await ctx.runMutation(internal.aiUsage.reserve, { userId, task: "caption" });
    try {
      const { out, spec } = await ladderObject(
        ctx,
        "caption",
        {
          system: CAPTION_SYSTEM,
          prompt: captionPrompt({ voice, note: note?.trim() || undefined, maxChars: Math.min(Math.max(maxChars ?? 1000, 100), 2000) }),
          schema: CaptionSchema,
          maxOutputTokens: 700,
          image: { bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: upload.contentType },
        },
        { userId },
      );
      await ctx.runMutation(internal.aiUsage.finalize, { usageId, model: spec, inputTokens: out.inputTokens, outputTokens: out.outputTokens });
      return tidyCaption(out.output.caption, out.output.hashtags);
    } catch (err) {
      await ctx.runMutation(internal.aiUsage.release, { usageId });
      if (err instanceof AllRungsFailed) {
        throw new ConvexError({ code: "AI_UNAVAILABLE", message: "The AI could not look at the image right now. Write the caption yourself, or try again in a minute." });
      }
      throw err;
    }
  },
});
