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
import { createHash } from "node:crypto";
import { decodeBase64Image, imageDamage, MCP_IMAGE_MAX_BYTES, MCP_IMAGE_TYPES, sniffImage } from "../lib/social/imageBytes";

const bad = (message: string, code = "INVALID_INPUT") => new ConvexError({ code, message });

const RESEND =
  "Send it again: smaller is safer (a JPEG under 200 KB), or give an imageUrl, or upload the file to the uploadUrl. " +
  "With base64, also send sha256 (the hex SHA-256 of the image bytes) so Necro can check every byte arrived.";

/** Refuses an image that was damaged on the way: a broken PNG/JPEG, or bytes that do not match the sender's sha256. */
function checkWhole(bytes: Uint8Array, type: "image/png" | "image/jpeg", sha256?: string) {
  if (sha256 !== undefined) {
    const want = sha256.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(want)) throw bad("sha256 must be the 64-character hex SHA-256 of the image bytes.");
    if (createHash("sha256").update(bytes).digest("hex") !== want) throw bad(`The image arrived damaged: its SHA-256 does not match. ${RESEND}`);
  }
  const damage = imageDamage(bytes, type);
  if (damage) throw bad(`The image arrived damaged: ${damage}. ${RESEND}`);
}

export const storeImage = action({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    keyId: v.union(v.id("apiKeys"), v.id("mcpGrants")),
    imageUrl: v.optional(v.string()),
    imageBase64: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    uploadedStorageId: v.optional(v.string()), // the storageId returned by POSTing bytes to request_image_upload's URL
    sha256: v.optional(v.string()), // optional: hex SHA-256 of the image bytes, checked against what arrived
  },
  handler: async (
    ctx,
    { secret, userId, keyId, imageUrl, imageBase64, mimeType, uploadedStorageId, sha256 },
  ): Promise<{ storageId: Id<"_storage">; imageId: Id<"_storage">; previewUrl: string | null; contentType: string; bytes: number }> => {
    const { keyLabel } = await ctx.runMutation(api.mcpWrite.startImageUpload, { secret, userId, keyId });
    if ([imageUrl, imageBase64, uploadedStorageId].filter(Boolean).length !== 1) {
      throw bad("Give exactly one of: storageId (from request_image_upload), imageUrl, or imageBase64 with mimeType.");
    }

    // Raw bytes already uploaded straight to Necro's storage: check the file itself, then register it.
    if (uploadedStorageId) {
      const info = await ctx.runQuery(internal.mcpWrite.storageInfo, { userId, storageId: uploadedStorageId });
      if (!info || info.claimedBy === "other") throw bad("No uploaded file with that storageId. Call request_image_upload and upload again.", "NOT_FOUND");
      if (info.claimedBy === "me") {
        const head = await ctx.storage.get(info.id);
        return { storageId: info.id, imageId: info.id, previewUrl: await ctx.storage.getUrl(info.id), contentType: info.contentType ?? "", bytes: head?.size ?? info.size };
      }
      const blob = await ctx.storage.get(info.id);
      const raw = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      const sniffed = raw ? sniffImage(raw) : null;
      if (!raw || raw.length > MCP_IMAGE_MAX_BYTES || !sniffed) {
        await ctx.storage.delete(info.id);
        throw bad(raw && raw.length > MCP_IMAGE_MAX_BYTES ? "The image is over 5 MB." : "Only PNG or JPEG images can be posted.");
      }
      try {
        checkWhole(raw, sniffed, sha256);
      } catch (e) {
        await ctx.storage.delete(info.id); // never keep a damaged upload
        throw e;
      }
      let id = info.id;
      if (info.contentType?.toLowerCase() !== sniffed) {
        // The upload's Content-Type header was missing or wrong: keep the bytes under the type they really are.
        id = await ctx.storage.store(new Blob([raw], { type: sniffed }));
        await ctx.storage.delete(info.id);
      }
      await ctx.runMutation(internal.mcpWrite.registerImage, { userId, storageId: id, keyId, keyLabel });
      return { storageId: id, imageId: id, previewUrl: await ctx.storage.getUrl(id), contentType: sniffed, bytes: raw.length };
    }
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
    checkWhole(bytes, type, sha256);

    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }));
    await ctx.runMutation(internal.mcpWrite.registerImage, { userId, storageId, keyId, keyLabel });
    return { storageId, imageId: storageId, previewUrl: await ctx.storage.getUrl(storageId), contentType: type, bytes: bytes.length };
  },
});
