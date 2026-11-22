import { createHmac, timingSafeEqual } from "node:crypto";

// Signed links to the generated post image, so Instagram's and TikTok's servers (which are not signed in)
// can fetch it for one hour, while nobody else can use Necro as a free image generator.
// POST_IMAGE_SECRET is set to the same value in Convex and in Vercel.

export const IMAGE_LINK_TTL_MS = 60 * 60 * 1000;

function secret(): string {
  const s = process.env.POST_IMAGE_SECRET;
  if (!s || s.length < 32) throw new Error("POST_IMAGE_SECRET is not set (32+ characters)");
  return s;
}

export function signImage(title: string, source: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${title}\n${source}\n${exp}`).digest("hex");
}

export function verifyImage(title: string, source: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp < now || exp > now + IMAGE_LINK_TTL_MS * 2 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const want = Buffer.from(signImage(title, source, exp), "hex");
  return timingSafeEqual(want, Buffer.from(sig, "hex"));
}

/** A public JPEG link to the post image for `appUrl` (e.g. https://necro.malitos.tech). */
export function signedImageUrl(appUrl: string, title: string, source: string, now = Date.now()): string {
  const t = title.slice(0, 200);
  const s = source.slice(0, 80);
  const exp = now + IMAGE_LINK_TTL_MS;
  const q = new URLSearchParams({ title: t, source: s, format: "jpg", exp: String(exp), sig: signImage(t, s, exp) });
  return `${appUrl.replace(/\/$/, "")}/api/post-image?${q}`;
}
