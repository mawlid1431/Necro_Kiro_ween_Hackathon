"use node";

// MCP write tools, image step (upload_post_image): an AI assistant hands Necro an image as base64 or an http(s) URL.
// The key is checked first (posts:write, write-call cap); URLs go through the SSRF-safe fetcher (http/https only,
// private and internal networks blocked, size capped while downloading); the type is decided from the file's own
// bytes. The stored image then works exactly like an upload from the app's composer.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { safeFetch, SafeFetchError } from "../lib/security/ssrf";
import { decodeBase64Image, MCP_IMAGE_MAX_BYTES, MCP_IMAGE_TYPES, sniffImage } from "../lib/social/imageBytes";

const bad = (message: string, code = "INVALID_INPUT") => new ConvexError({ code, message });

export const storeImage = action({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    keyId: v.union(v.id("apiKeys"), v.id("mcpGrants")),
    imageUrl: v.optional(v.string()),
    imageBase64: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { secret, userId, keyId, imageUrl, imageBase64, mimeType },
  ): Promise<{ storageId: Id<"_storage">; imageId: Id<"_storage">; previewUrl: string | null; contentType: string; bytes: number }> => {
    const { keyLabel } = await ctx.runMutation(api.mcpWrite.startImageUpload, { secret, userId, keyId });
    if (!imageUrl === !imageBase64) throw bad("Give either imageUrl or imageBase64 (with mimeType), not both.");
    const declared = mimeType?.trim().toLowerCase().replace("image/jpg", "image/jpeg");
    if (declared !== undefined && !(MCP_IMAGE_TYPES as readonly string[]).includes(declared)) {
      throw bad(`Only PNG or JPEG images can be posted (got ${declared.slice(0, 40)}). LinkedIn and Instagram do not accept WebP.`);
    }

    let bytes: Uint8Array | null = null;
    if (imageBase64) {
      bytes = decodeBase64Image(imageBase64);
      if (!bytes) throw bad("imageBase64 is not valid base64, or the image is over 5 MB.");
    } else {
      let url: URL;
      try {
        url = new URL(imageUrl!);
      } catch {
        throw bad("imageUrl is not a valid URL.");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw bad("imageUrl must start with http:// or https://.", "BLOCKED");
      try {
        const res = await safeFetch(url.toString(), { raw: true, maxBytes: MCP_IMAGE_MAX_BYTES, timeoutMs: 15_000, accept: "image/png,image/jpeg;q=0.9,*/*;q=0.1" });
        if (res.status !== 200 || !res.bytes) throw bad(`The image URL answered ${res.status}.`);
        bytes = res.bytes;
      } catch (e) {
        if (e instanceof ConvexError) throw e;
        const msg = e instanceof SafeFetchError ? e.message : "The image could not be downloaded.";
        throw bad(msg, e instanceof SafeFetchError && e.code === "BLOCKED" ? "BLOCKED" : "INVALID_INPUT");
      }
    }
    if (bytes.length > MCP_IMAGE_MAX_BYTES) throw bad("The image is over 5 MB.");
    const type = sniffImage(bytes);
    if (!type) throw bad("Only PNG or JPEG images can be posted.");
    if (declared && declared !== type) throw bad(`mimeType says ${declared} but the file is ${type}.`);

    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }));
    await ctx.runMutation(internal.mcpWrite.registerImage, { userId, storageId, keyId, keyLabel });
    return { storageId, imageId: storageId, previewUrl: await ctx.storage.getUrl(storageId), contentType: type, bytes: bytes.length };
  },
});
