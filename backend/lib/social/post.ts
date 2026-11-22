// The exact text that leaves Necro for a platform. The preview, the copy button, the counter,
// the share intent and the API call all use this, so the post looks exactly like the preview.

export type DraftPlatform = "linkedin" | "x" | "instagram";
export type SocialPlatform = DraftPlatform | "tiktok";
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["linkedin", "x", "instagram", "tiktok"];

/** TikTok has no draft of its own: it posts the Instagram caption with the same image. */
export const draftFor = (p: SocialPlatform): DraftPlatform => (p === "tiktok" ? "instagram" : p);

/** Characters each platform accepts in the post body. */
export const POST_LIMITS: Record<SocialPlatform, number> = { linkedin: 3000, x: 280, instagram: 2200, tiktok: 4000 };

export const URL_RE = /https?:\/\/[^\s]+/g;

/**
 * - LinkedIn and X: the article link is in the text (what makes the platform draw a link card).
 * - Instagram and TikTok: captions do not make links clickable, so the link is left out.
 * - Hashtags last, after a blank line.
 */
export function finalPost(platform: SocialPlatform, text: string, hashtags: string[], link?: string): string {
  let body = text.trim();
  if (link && (platform === "linkedin" || platform === "x") && !body.includes(link)) body = `${body}\n\n${link}`;
  return hashtags.length ? `${body}\n\n${hashtags.join(" ")}` : body;
}

/** Length as the platform counts it: X counts every link as 23 characters. */
export function postLength(platform: SocialPlatform, post: string): number {
  return platform === "x" ? post.replace(URL_RE, "x".repeat(23)).length : post.length;
}
