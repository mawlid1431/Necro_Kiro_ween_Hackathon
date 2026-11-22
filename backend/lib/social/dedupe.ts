// One post, once. Every publish row carries a content key; while a row with the same key is going out, waiting,
// or already posted, the same post cannot be created again for that user and platform. Cancelled and failed
// rows do not block, so a post can be retried or rescheduled.
//
// Article posts (Resurrect): one per article per platform, whatever edits are made to the text.
// Manual posts (composer): the same caption and image on the same platform count as the same post.

import type { SocialPlatform } from "./post";

export type PublishStatus = "posting" | "posted" | "failed" | "scheduled" | "due" | "canceled";
export const BLOCKING: readonly PublishStatus[] = ["posting", "posted", "scheduled", "due"];
export const isBlocking = (s: PublishStatus) => BLOCKING.includes(s);

/** Lower-cased, whitespace-collapsed text, so trivial edits (a trailing space, a capital) are still the same post. */
export function normalizeCaption(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** 64-bit FNV-1a as hex (two 32-bit lanes): stable, fast, and runs in any Convex runtime. */
export function hash64(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const articleKey = (itemId: string, platform: SocialPlatform) => `a:${platform}:${itemId}`;
export const manualKey = (platform: SocialPlatform, text: string, imageId?: string) =>
  `m:${platform}:${imageId ?? "-"}:${hash64(normalizeCaption(text))}`;

/** What to tell the user when the same post already exists. */
export function duplicateMessage(platformName: string, row: { status: PublishStatus; at?: number; createdAt: number }, fmt: (ms: number) => string): string {
  const when = fmt(row.at ?? row.createdAt);
  if (row.status === "posted") return `Already posted to ${platformName} (${when}). The same post can't go out twice.`;
  if (row.status === "posting") return `This post is already going out to ${platformName}.`;
  return `Already scheduled for ${platformName} (${when}). Move or cancel it in Witching Hour instead.`;
}
