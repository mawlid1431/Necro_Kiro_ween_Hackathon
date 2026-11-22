// OAuth and posting for LinkedIn, X, Instagram (Instagram Login) and TikTok, from each platform's
// official API docs (checked 2026-11-22; see docs/specs/connectors.md). Plain fetch, no SDKs.
// Every function takes the credentials it needs, so this file holds no secrets and is easy to test.

import type { SocialPlatform } from "./post";

export type Creds = { clientId: string; clientSecret: string };
export type Tokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // ms epoch
  refreshExpiresAt?: number;
  scope?: string;
  accountId?: string; // some token endpoints return the account id
};
export type Profile = { accountId: string; username?: string; name?: string; avatarUrl?: string };
export type Published = { postId: string; url?: string; note?: string };

export class SocialError extends Error {
  constructor(public code: "AUTH_EXPIRED" | "NOT_CONFIGURED" | "PLATFORM" | "INVALID_INPUT", message: string) {
    super(message);
    this.name = "SocialError";
  }
}

export const CRED_VARS: Record<SocialPlatform, [string, string]> = {
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
};

export function credsFor(p: SocialPlatform, env: Record<string, string | undefined> = process.env): Creds | null {
  const [id, secret] = CRED_VARS[p];
  const clientId = env[id]?.trim();
  const clientSecret = env[secret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const USES_PKCE: Record<SocialPlatform, boolean> = { linkedin: false, x: true, instagram: false, tiktok: false };

const SCOPES: Record<SocialPlatform, string> = {
  linkedin: "openid profile w_member_social",
  x: "tweet.read tweet.write users.read offline.access media.write",
  instagram: "instagram_business_basic,instagram_business_content_publish",
  tiktok: "user.info.basic,video.publish",
};

const LINKEDIN_VERSION = () => process.env.LINKEDIN_API_VERSION || "202611";
const IG_GRAPH = () => `https://graph.instagram.com${process.env.INSTAGRAM_GRAPH_VERSION ? `/${process.env.INSTAGRAM_GRAPH_VERSION}` : ""}`;

export function authorizeUrl(p: SocialPlatform, o: { clientId: string; redirectUri: string; state: string; codeChallenge?: string }): string {
  const q = new URLSearchParams();
  if (p === "tiktok") q.set("client_key", o.clientId);
  else q.set("client_id", o.clientId);
  q.set("response_type", "code");
  q.set("redirect_uri", o.redirectUri);
  q.set("scope", SCOPES[p]);
  q.set("state", o.state);
  if (USES_PKCE[p] && o.codeChallenge) {
    q.set("code_challenge", o.codeChallenge);
    q.set("code_challenge_method", "S256");
  }
  const base = {
    linkedin: "https://www.linkedin.com/oauth/v2/authorization",
    x: "https://x.com/i/oauth2/authorize",
    instagram: "https://www.instagram.com/oauth/authorize",
    tiktok: "https://www.tiktok.com/v2/auth/authorize/",
  }[p];
  return `${base}?${q}`;
}

// ---------- HTTP helpers ----------

type Json = Record<string, unknown>;

/** Pulls a human message out of any of the four platforms' error shapes. */
function platformMessage(body: unknown, status: number): string {
  const b = (body ?? {}) as Json;
  const err = b.error as Json | string | undefined;
  const pick = [
    typeof err === "object" ? (err.message as string) : undefined,
    typeof err === "object" && err.code && err.code !== "ok" ? String(err.code) : undefined,
    b.error_description as string,
    b.message as string,
    b.detail as string,
    (b.errors as Json[] | undefined)?.[0]?.message as string,
    b.error_message as string,
    typeof err === "string" ? err : undefined,
  ].find((s) => typeof s === "string" && s.length > 0);
  return (pick ?? `HTTP ${status}`).slice(0, 300);
}

async function call(url: string, init: RequestInit & { expect?: number[] } = {}): Promise<{ body: Json; res: Response }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body: Json = {};
  try {
    body = text ? (JSON.parse(text) as Json) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }
  const ok = init.expect ? init.expect.includes(res.status) : res.ok;
  // TikTok answers 200 with error.code != "ok" on failure.
  const tiktokErr = (body.error as Json | undefined)?.code;
  if (!ok || (typeof tiktokErr === "string" && tiktokErr !== "ok")) {
    const msg = platformMessage(body, res.status);
    if (res.status === 401 || /invalid[_ ]token|expired|access_token_invalid|revoked/i.test(msg)) throw new SocialError("AUTH_EXPIRED", msg);
    throw new SocialError("PLATFORM", msg);
  }
  return { body, res };
}

const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

const basic = (c: Creds) => `Basic ${Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`).toString("base64")}`;
const inMs = (seconds: unknown, now: number) => (typeof seconds === "number" && seconds > 0 ? now + seconds * 1000 : undefined);

function toTokens(b: Json, now: number): Tokens {
  const accessToken = b.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new SocialError("PLATFORM", "The platform did not return an access token.");
  return {
    accessToken,
    refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : undefined,
    expiresAt: inMs(b.expires_in, now),
    refreshExpiresAt: inMs(b.refresh_expires_in ?? b.refresh_token_expires_in, now),
    scope: typeof b.scope === "string" ? b.scope : undefined,
    accountId: b.open_id ? String(b.open_id) : b.user_id ? String(b.user_id) : undefined,
  };
}

// ---------- token exchange and refresh ----------

export async function exchangeCode(p: SocialPlatform, c: Creds, o: { code: string; redirectUri: string; codeVerifier?: string }, now = Date.now()): Promise<Tokens> {
  if (p === "linkedin") {
    const { body } = await call("https://www.linkedin.com/oauth/v2/accessToken", form({ grant_type: "authorization_code", code: o.code, redirect_uri: o.redirectUri, client_id: c.clientId, client_secret: c.clientSecret }));
    return toTokens(body, now);
  }
  if (p === "x") {
    const { body } = await call("https://api.x.com/2/oauth2/token", {
      ...form({ grant_type: "authorization_code", code: o.code, redirect_uri: o.redirectUri, code_verifier: o.codeVerifier ?? "" }),
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(c) },
    });
    return toTokens(body, now);
  }
  if (p === "instagram") {
    const { body } = await call("https://api.instagram.com/oauth/access_token", form({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", redirect_uri: o.redirectUri, code: o.code }));
    const short = ((body.data as Json[] | undefined)?.[0] ?? body) as Json; // older responses wrap it in data[]
    const shortTok = toTokens(short, now);
    // Swap the 1-hour token for a 60-day one (server side only).
    const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: c.clientSecret, access_token: shortTok.accessToken });
    const long = await call(`https://graph.instagram.com/access_token?${q}`);
    return { ...toTokens(long.body, now), accountId: shortTok.accountId };
  }
  const { body } = await call("https://open.tiktokapis.com/v2/oauth/token/", form({ client_key: c.clientId, client_secret: c.clientSecret, code: o.code, grant_type: "authorization_code", redirect_uri: o.redirectUri }));
  return toTokens(body, now);
}

/** New tokens, or null when the platform gives this app no way to refresh (LinkedIn: reconnect). */
export async function refreshTokens(p: SocialPlatform, c: Creds, t: Tokens, now = Date.now()): Promise<Tokens | null> {
  if (p === "linkedin") {
    if (!t.refreshToken) return null;
    const { body } = await call("https://www.linkedin.com/oauth/v2/accessToken", form({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: c.clientId, client_secret: c.clientSecret }));
    return toTokens(body, now);
  }
  if (p === "x") {
    if (!t.refreshToken) return null;
    const { body } = await call("https://api.x.com/2/oauth2/token", {
      ...form({ grant_type: "refresh_token", refresh_token: t.refreshToken }),
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(c) },
    });
    const n = toTokens(body, now);
    return { ...n, refreshToken: n.refreshToken ?? t.refreshToken };
  }
  if (p === "instagram") {
    const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: t.accessToken });
    const { body } = await call(`https://graph.instagram.com/refresh_access_token?${q}`);
    return toTokens(body, now);
  }
  if (!t.refreshToken) return null;
  // TikTok rotates refresh tokens: the old one stops working, so the new one must be stored.
  const { body } = await call("https://open.tiktokapis.com/v2/oauth/token/", form({ client_key: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: t.refreshToken }));
  return toTokens(body, now);
}

// ---------- profile ----------

export async function fetchProfile(p: SocialPlatform, accessToken: string, hintId?: string): Promise<Profile> {
  const bearer = { authorization: `Bearer ${accessToken}` };
  if (p === "linkedin") {
    const { body } = await call("https://api.linkedin.com/v2/userinfo", { headers: bearer });
    return { accountId: String(body.sub), name: body.name as string | undefined, avatarUrl: body.picture as string | undefined };
  }
  if (p === "x") {
    const { body } = await call("https://api.x.com/2/users/me?user.fields=profile_image_url", { headers: bearer });
    const d = body.data as Json;
    return { accountId: String(d.id), username: d.username as string, name: d.name as string, avatarUrl: d.profile_image_url as string | undefined };
  }
  if (p === "instagram") {
    const q = new URLSearchParams({ fields: "user_id,username,name,profile_picture_url", access_token: accessToken });
    const { body } = await call(`${IG_GRAPH()}/me?${q}`);
    return {
      accountId: String(body.user_id ?? body.id ?? hintId),
      username: body.username as string | undefined,
      name: (body.name as string | undefined) || (body.username as string | undefined),
      avatarUrl: body.profile_picture_url as string | undefined,
    };
  }
  const { body } = await call("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name", { headers: bearer });
  const u = ((body.data as Json)?.user ?? {}) as Json;
  return { accountId: String(u.open_id ?? hintId), name: u.display_name as string | undefined, avatarUrl: u.avatar_url as string | undefined };
}

// ---------- publishing ----------

/** LinkedIn "little text" format: reserved characters must be escaped, hashtags stay hashtags. */
export function escapeLinkedIn(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~#]/g, (ch, i: number, s: string) => {
    if (ch === "#" && /[\p{L}\p{N}]/u.test(s[i + 1] ?? "") && (i === 0 || /\s/.test(s[i - 1]))) return ch;
    return `\\${ch}`;
  });
}

export type LinkedInArticle = { url: string; title: string; description?: string; image?: { bytes: Uint8Array; type: string } };

export async function publishLinkedIn(accessToken: string, personId: string, text: string, article?: LinkedInArticle): Promise<Published> {
  const author = `urn:li:person:${personId}`;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "linkedin-version": LINKEDIN_VERSION(),
    "x-restli-protocol-version": "2.0.0",
    "content-type": "application/json",
  };
  let thumbnail: string | undefined;
  if (article?.image) {
    try {
      const { body } = await call("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers,
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const v = body.value as Json;
      const up = await fetch(String(v.uploadUrl), {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": article.image.type },
        body: Buffer.from(article.image.bytes),
        signal: AbortSignal.timeout(30_000),
      });
      if (up.ok) thumbnail = String(v.image);
    } catch {
      thumbnail = undefined; // the post still goes out, with a card without a picture
    }
  }
  const payload: Json = {
    author,
    commentary: escapeLinkedIn(text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (article) {
    payload.content = {
      article: {
        source: article.url,
        title: article.title.slice(0, 400),
        ...(article.description ? { description: article.description.slice(0, 4000) } : {}),
        ...(thumbnail ? { thumbnail } : {}),
      },
    };
  }
  const { res } = await call("https://api.linkedin.com/rest/posts", { method: "POST", headers, body: JSON.stringify(payload), expect: [201] });
  const urn = res.headers.get("x-restli-id") ?? "";
  return { postId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : undefined };
}

export async function publishX(accessToken: string, username: string | undefined, text: string): Promise<Published> {
  const { body } = await call("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
    expect: [200, 201],
  });
  const id = String((body.data as Json).id);
  return { postId: id, url: `https://x.com/${username || "i/web"}/status/${id}` };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function publishInstagram(accessToken: string, igUserId: string, caption: string, imageUrl: string): Promise<Published> {
  const g = IG_GRAPH();
  const container = await call(`${g}/${igUserId}/media`, form({ image_url: imageUrl, caption, access_token: accessToken }));
  const creationId = String(container.body.id);
  // Wait until Instagram has fetched and processed the image.
  for (let i = 0; i < 20; i++) {
    const { body } = await call(`${g}/${creationId}?${new URLSearchParams({ fields: "status_code,status", access_token: accessToken })}`);
    if (body.status_code === "FINISHED") break;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") throw new SocialError("PLATFORM", `Instagram could not process the image (${String(body.status ?? body.status_code)}).`);
    await sleep(1500);
  }
  const pub = await call(`${g}/${igUserId}/media_publish`, form({ creation_id: creationId, access_token: accessToken }));
  const mediaId = String(pub.body.id);
  let url: string | undefined;
  try {
    const { body } = await call(`${g}/${mediaId}?${new URLSearchParams({ fields: "permalink", access_token: accessToken })}`);
    url = body.permalink as string | undefined;
  } catch {
    url = undefined;
  }
  return { postId: mediaId, url };
}

export type TikTokCreator = { nickname?: string; username?: string; privacyOptions: string[]; commentDisabled: boolean; maxVideoDuration?: number };

export async function tiktokCreatorInfo(accessToken: string): Promise<TikTokCreator> {
  const { body } = await call("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
  });
  const d = (body.data ?? {}) as Json;
  return {
    nickname: d.creator_nickname as string | undefined,
    username: d.creator_username as string | undefined,
    privacyOptions: (d.privacy_level_options as string[] | undefined) ?? [],
    commentDisabled: Boolean(d.comment_disabled),
  };
}

export type TikTokOptions = { privacyLevel: string; allowComments: boolean; yourBrand: boolean; brandedContent: boolean };

export async function publishTikTok(accessToken: string, title: string, description: string, imageUrl: string, o: TikTokOptions): Promise<Published> {
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" };
  const { body } = await call("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      media_type: "PHOTO",
      post_mode: "DIRECT_POST",
      post_info: {
        title: [...title].slice(0, 90).join(""),
        description: description.slice(0, 4000),
        privacy_level: o.privacyLevel,
        disable_comment: !o.allowComments,
        auto_add_music: true,
        brand_content_toggle: o.brandedContent,
        brand_organic_toggle: o.yourBrand,
      },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [imageUrl] },
    }),
  });
  const publishId = String((body.data as Json).publish_id);
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    const s = await call("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers, body: JSON.stringify({ publish_id: publishId }) });
    const d = (s.body.data ?? {}) as Json;
    if (d.status === "PUBLISH_COMPLETE") {
      const ids = d.publicaly_available_post_id as unknown[] | undefined;
      return { postId: ids?.length ? String(ids[0]) : publishId };
    }
    if (d.status === "FAILED") throw new SocialError("PLATFORM", `TikTok could not post it (${String(d.fail_reason ?? "failed")}).`);
  }
  // Still processing: TikTok finishes on its side (it can take a few minutes).
  return { postId: publishId, note: "processing" };
}
