// @vitest-environment node
// Connectors: the post text that leaves Necro, token sealing, signed image links, link cards, OAuth URLs.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { finalPost, postLength, draftFor } from "../../lib/social/post";
import { seal, unseal } from "../../lib/social/crypto";
import { signedImageUrl, verifyImage } from "../../lib/social/imageSig";
import { parseLinkCard } from "../../lib/social/og";
import { authorizeUrl, credsFor, escapeLinkedIn, exchangeCode, publishX, SocialError } from "../../lib/social/providers";

beforeEach(() => {
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.POST_IMAGE_SECRET = "s".repeat(40);
});
afterEach(() => vi.unstubAllGlobals());

test("finalPost: link added once for LinkedIn and X, never for Instagram/TikTok; hashtags last", () => {
  const link = "https://example.com/a";
  expect(finalPost("linkedin", "Hello", ["#ai"], link)).toBe(`Hello\n\n${link}\n\n#ai`);
  expect(finalPost("x", `Read ${link}`, [], link)).toBe(`Read ${link}`);
  expect(finalPost("instagram", "Caption", ["#a", "#b"], link)).toBe("Caption\n\n#a #b");
  expect(finalPost("tiktok", "Caption", [], link)).toBe("Caption");
  expect(draftFor("tiktok")).toBe("instagram");
});

test("postLength: X counts any link as 23 characters", () => {
  const long = "https://example.com/" + "a".repeat(100);
  expect(postLength("x", `Hi ${long}`)).toBe(3 + 23);
  expect(postLength("linkedin", `Hi ${long}`)).toBe(3 + long.length);
});

test("tokens are sealed (not readable) and round-trip; tampering is rejected", () => {
  const s = seal("secret-token");
  expect(s).not.toContain("secret-token");
  expect(unseal(s)).toBe("secret-token");
  const parts = s.split(".");
  parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
  expect(() => unseal(parts.join("."))).toThrow();
});

test("signed image links verify, and expire or break when changed", () => {
  const now = Date.UTC(2026, 10, 22);
  const url = new URL(signedImageUrl("https://necro.malitos.tech/", "Title", "Source", now));
  const q = url.searchParams;
  expect(url.origin + url.pathname).toBe("https://necro.malitos.tech/api/post-image");
  expect(q.get("format")).toBe("jpg");
  const ok = (title: string, at = now) => verifyImage(title, q.get("source")!, Number(q.get("exp")), q.get("sig")!, at);
  expect(ok("Title")).toBe(true);
  expect(ok("Other title")).toBe(false);
  expect(ok("Title", now + 2 * 3600_000)).toBe(false);
});

test("parseLinkCard reads OG/Twitter tags like the platforms", () => {
  const html = `<head><title>Fallback</title>
    <meta property="og:title" content="Big &amp; bold">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:description" content='Desc'>
    <meta property="og:image" content="/img/card.png"></head>`;
  const c = parseLinkCard(html, "https://www.example.com/post");
  expect(c).toMatchObject({ domain: "example.com", title: "Big & bold", description: "Desc", image: "https://www.example.com/img/card.png", card: "summary_large_image" });
  expect(parseLinkCard("<title>Only</title>", "https://a.dev/").card).toBe("summary");
});

test("LinkedIn little-text escaping keeps hashtags, escapes reserved characters", () => {
  expect(escapeLinkedIn("Hi (all) #ai @bob a_b #")).toBe("Hi \\(all\\) #ai \\@bob a\\_b \\#");
});

test("authorize URLs: PKCE only for X, client_key for TikTok, comma scopes for Instagram", () => {
  const base = { clientId: "id", redirectUri: "https://necro.malitos.tech/connectors/callback/x", state: "st", codeChallenge: "ch" };
  const x = new URL(authorizeUrl("x", base));
  expect(x.host).toBe("x.com");
  expect(x.searchParams.get("code_challenge_method")).toBe("S256");
  expect(x.searchParams.get("scope")).toContain("tweet.write");
  const li = new URL(authorizeUrl("linkedin", base));
  expect(li.searchParams.get("code_challenge")).toBeNull();
  expect(li.searchParams.get("scope")).toBe("openid profile w_member_social");
  const tt = new URL(authorizeUrl("tiktok", base));
  expect(tt.searchParams.get("client_key")).toBe("id");
  expect(new URL(authorizeUrl("instagram", base)).searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
});

test("credsFor: missing keys mean not configured", () => {
  expect(credsFor("x", {})).toBeNull();
  expect(credsFor("x", { X_CLIENT_ID: "a", X_CLIENT_SECRET: "b" })).toEqual({ clientId: "a", clientSecret: "b" });
});

test("X token exchange uses Basic auth and the PKCE verifier", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 7200 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const t = await exchangeCode("x", { clientId: "cid", clientSecret: "sec" }, { code: "c", redirectUri: "https://r", codeVerifier: "ver" }, 0);
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", expiresAt: 7_200_000 });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
  expect(String(init.body)).toContain("code_verifier=ver");
});

test("platform errors become readable SocialErrors; 401 means reconnect", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 })));
  await expect(publishX("t", "me", "hi")).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "duplicate content" }] }), { status: 403 })));
  const e = await publishX("t", "me", "hi").catch((x) => x);
  expect(e).toBeInstanceOf(SocialError);
  expect(e.message).toBe("duplicate content");
});
