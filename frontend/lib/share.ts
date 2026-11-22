"use client";

import type { SocialPlatform } from "@/lib/post";
import { postImageUrl } from "@/lib/post";

// Sharing by hand (no connected account): the platform's own composer, the phone's share sheet, or copy + image.
// Used by Resurrect and by Witching Hour's "Share now" on a reminder.

/** The platform's own composer with the text filled in. Instagram and TikTok have no web composer. */
export function shareUrl(p: SocialPlatform, text: string): string {
  if (p === "x") return `https://x.com/intent/post?text=${encodeURIComponent(text)}`; // the link is already in the text
  if (p === "linkedin") return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
  if (p === "tiktok") return "https://www.tiktok.com/upload";
  return "https://www.instagram.com/";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The generated article image ({title, source}) or your own uploaded image ({url}). */
export type ShareImage = { title: string; source: string } | { url: string };

async function imageFile(img: ShareImage): Promise<File | null> {
  try {
    const res = await fetch("url" in img ? img.url : postImageUrl(img.title, img.source));
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
    return new File([blob], type === "image/jpeg" ? "necro-post.jpg" : "necro-post.png", { type });
  } catch {
    return null;
  }
}

/** Saves the same image the preview shows (Instagram and TikTok need a picture). */
export async function saveImage(img: ShareImage): Promise<boolean> {
  const file = await imageFile(img);
  if (!file) return false;
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement("a"), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * Opens the phone's share sheet with the caption and, where the device allows, the post image attached, so the
 * user can pick Instagram, TikTok, X, LinkedIn, WhatsApp… and post from that app. The caption is also copied,
 * because some apps drop shared text. Returns false when the sheet is unavailable or closed.
 */
export async function shareSheet(o: { title: string; text: string; url?: string; image?: ShareImage }): Promise<boolean> {
  if (typeof navigator.share !== "function") return false;
  await copyText(o.text);
  const file = o.image ? await imageFile(o.image) : null;
  const data: ShareData = { title: o.title, text: o.text };
  if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
  else if (o.url) data.url = o.url;
  try {
    await navigator.share(data);
    return true;
  } catch {
    return false; // closed by the user
  }
}

/**
 * Share by hand in one click: copy the text, open the composer (inside the click, so popup blockers allow it),
 * and save the image for Instagram and TikTok. Returns false when the new tab was blocked.
 */
export async function shareByHand(p: SocialPlatform, text: string, image?: ShareImage): Promise<{ opened: boolean; copied: boolean }> {
  const copied = copyText(text);
  const win = window.open(shareUrl(p, text), "_blank");
  if (win) win.opener = null;
  const ok = await copied;
  // Instagram/TikTok always need the picture; your own uploaded photo is saved for any platform to attach.
  if (image && (p === "instagram" || p === "tiktok" || "url" in image)) await saveImage(image);
  return { opened: !!win, copied: ok };
}
