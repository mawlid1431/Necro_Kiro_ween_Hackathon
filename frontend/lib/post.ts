// One post text everywhere (preview, counter, copy, share intent, API post): shared with the backend.
export { finalPost, postLength, POST_LIMITS, URL_RE, draftFor, SOCIAL_PLATFORMS, type SocialPlatform } from "@backend/lib/social/post";

/** The square image Necro makes for Instagram and TikTok (same file in the preview, the download and the post). */
export function postImageUrl(title: string, source: string): string {
  return `/api/post-image?${new URLSearchParams({ title: title.slice(0, 200), source: source.slice(0, 80) })}`;
}
