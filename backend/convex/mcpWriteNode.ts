"use node";

// MCP write tools, image step: an AI assistant hands Necro a poster it designed, as an https URL or base64 data.
// The key is checked first (scope "write"); URLs go through the SSRF-safe fetcher (private networks blocked, size
// capped); the type is decided from the file's own bytes. The stored image then works exactly like an app upload.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { safeFetch, SafeFetchError } from "../lib/security/ssrf";
import { decodeBase64Image, MCP_IMAGE_MAX_BYTES, sniffImage } from "../lib/social/imageBytes";

export const storeImage = action({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    keyId: v.union(v.id("apiKeys"), v.id("mcpGrants")),
    imageUrl: v.optional(v.string()),
    imageBase64: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, keyId, imageUrl, imageBase64 }): Promise<{ storageId: Id<"_storage">; contentType: string; bytes: number }> => {
    await ctx.runQuery(api.mcpWrite.assertWriteKey, { secret, userId, keyId });
    if (!imageUrl === !imageBase64) throw new ConvexError({ code: "INVALID_INPUT", message: "Give either image_url or image_base64, not both." });

    let bytes: Uint8Array | null = null;
    if (imageBase64) {
      bytes = decodeBase64Image(imageBase64);
      if (!bytes) throw new ConvexError({ code: "INVALID_INPUT", message: "image_base64 is not valid base64, or the image is over 8 MB." });
    } else {
      try {
        const res = await safeFetch(imageUrl!, { raw: true, maxBytes: MCP_IMAGE_MAX_BYTES, timeoutMs: 15_000, accept: "image/png,image/jpeg;q=0.9,*/*;q=0.1" });
        if (res.status !== 200 || !res.bytes) throw new ConvexError({ code: "INVALID_INPUT", message: `The image URL answered ${res.status}.` });
        bytes = res.bytes;
      } catch (e) {
        if (e instanceof ConvexError) throw e;
        const msg = e instanceof SafeFetchError ? e.message : "The image could not be downloaded.";
        throw new ConvexError({ code: e instanceof SafeFetchError && e.code === "BLOCKED" ? "BLOCKED" : "INVALID_INPUT", message: msg });
      }
    }
    if (bytes.length > MCP_IMAGE_MAX_BYTES) throw new ConvexError({ code: "INVALID_INPUT", message: "The image is over 8 MB." });
    const type = sniffImage(bytes);
    if (!type) throw new ConvexError({ code: "INVALID_INPUT", message: "Only PNG or JPG images can be posted." });

    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }));
    await ctx.runMutation(internal.mcpWrite.registerImage, { userId, storageId });
    return { storageId, contentType: type, bytes: bytes.length };
  },
});
