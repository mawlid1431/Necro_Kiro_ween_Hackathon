"use node";

// Connectors: OAuth with each platform and "Post now". Runs on Node for crypto and the SSRF-safe fetch.
// Every action resolves the caller from their Clerk session (users.currentId), never from an argument.

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { socialPlatform } from "./schema";
import { fail } from "./lib/auth";
import { randomToken, seal, unseal } from "../lib/social/crypto";
import { signedImageUrl } from "../lib/social/imageSig";
import { parseLinkCard } from "../lib/social/og";
import { draftFor, finalPost, POST_LIMITS, postLength, type SocialPlatform } from "../lib/social/post";
import {
  authorizeUrl,
  credsFor,
  exchangeCode,
  fetchProfile,
  publishInstagram,
  publishLinkedIn,
  publishTikTok,
  publishX,
  refreshTokens,
  SocialError,
  tiktokCreatorInfo,
  USES_PKCE,
  type Creds,
  type LinkedInArticle,
  type TikTokCreator,
  type Tokens,
} from "../lib/social/providers";
import { safeFetch } from "../lib/security/ssrf";

const NAMES: Record<SocialPlatform, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok" };

function appUrl(): string {
  const u = process.env.APP_URL?.replace(/\/$/, "");
  if (!u) throw new Error("APP_URL is not set");
  return u;
}

const redirectUri = (p: SocialPlatform) => `${appUrl()}/connectors/callback/${p}`;

function requireCreds(p: SocialPlatform): Creds {
  const c = credsFor(p);
  if (!c) fail("FORBIDDEN", `${NAMES[p]} is not set up on this Necro server yet.`);
  return c;
}

/** Step 1: where to send the browser. The state and PKCE verifier are stored for the callback. */
export const begin = action({
  args: { platform: socialPlatform },
  handler: async (ctx, { platform }): Promise<{ url: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const creds = requireCreds(platform);
    const state = randomToken(24);
    const verifier = USES_PKCE[platform] ? randomToken(48) : undefined;
    const codeChallenge = verifier ? createHash("sha256").update(verifier).digest("base64url") : undefined;
    await ctx.runMutation(internal.social.saveState, { userId, platform, state, verifier });
    return { url: authorizeUrl(platform, { clientId: creds.clientId, redirectUri: redirectUri(platform), state, codeChallenge }) };
  },
});

/** Step 2: the callback page hands over `code` and `state`; tokens are exchanged, sealed and stored. */
export const complete = action({
  args: { platform: socialPlatform, code: v.string(), state: v.string() },
  handler: async (ctx, { platform, code, state }): Promise<{ name: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    if (code.length > 2048 || state.length > 200) fail("INVALID_INPUT", "That sign-in link is not valid.");
    const saved = await ctx.runMutation(internal.social.takeState, { userId, platform, state });
    if (!saved) fail("FORBIDDEN", "This connection attempt expired or was already used. Start again from Connectors.");
    const creds = requireCreds(platform);
    try {
      const tokens = await exchangeCode(platform, creds, { code, redirectUri: redirectUri(platform), codeVerifier: saved.verifier });
      const profile = await fetchProfile(platform, tokens.accessToken, tokens.accountId);
      await ctx.runMutation(internal.social.saveConnection, {
        userId,
        platform,
        accountId: profile.accountId,
        username: profile.username,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        ...sealTokens(tokens),
      });
      return { name: profile.name || profile.username || NAMES[platform] };
    } catch (e) {
      if (e instanceof SocialError) fail("FORBIDDEN", `${NAMES[platform]} said: ${e.message}`);
      throw e;
    }
  },
});

function sealTokens(t: Tokens) {
  return {
    accessToken: seal(t.accessToken),
    refreshToken: t.refreshToken ? seal(t.refreshToken) : undefined,
    expiresAt: t.expiresAt,
    refreshExpiresAt: t.refreshExpiresAt,
    scope: t.scope,
  };
}

/** A working access token: refreshed first when it expires within 5 minutes and the platform allows it. */
async function freshToken(ctx: ActionCtx, c: Doc<"connections">): Promise<string> {
  const p = c.platform;
  const soon = Date.now() + 5 * 60 * 1000;
  if (!c.expiresAt || c.expiresAt > soon) return unseal(c.accessToken);
  const tokens: Tokens = { accessToken: unseal(c.accessToken), refreshToken: c.refreshToken ? unseal(c.refreshToken) : undefined };
  const next = c.expiresAt > Date.now() || tokens.refreshToken ? await refreshTokens(p, requireCreds(p), tokens).catch(() => null) : null;
  if (!next) {
    await ctx.runMutation(internal.social.markExpired, { connectionId: c._id });
    fail("FORBIDDEN", `Your ${NAMES[p]} connection has expired. Reconnect it in Connectors.`);
  }
  await ctx.runMutation(internal.social.updateTokens, { connectionId: c._id, ...sealTokens(next) });
  return next.accessToken;
}

/** The card LinkedIn will show: title, description and picture read from the article, like the preview. */
async function linkedInArticle(link: string, fallbackTitle: string): Promise<LinkedInArticle> {
  const article: LinkedInArticle = { url: link, title: fallbackTitle };
  try {
    const page = await safeFetch(link, { userAgent: "LinkedInBot/1.0", accept: "text/html,application/xhtml+xml", maxBytes: 2 * 1024 * 1024, timeoutMs: 8000 });
    const card = parseLinkCard(page.body, page.url);
    article.title = card.title || fallbackTitle;
    article.description = card.description;
    if (card.image) {
      const img = await safeFetch(card.image, { raw: true, accept: "image/jpeg,image/png,image/gif", maxBytes: 8 * 1024 * 1024, timeoutMs: 8000 });
      const type = img.contentType.split(";")[0].trim().toLowerCase();
      if (img.bytes && ["image/jpeg", "image/png", "image/gif"].includes(type)) article.image = { bytes: img.bytes, type };
    }
  } catch {
    // An unreachable article still gets a card with its title.
  }
  return article;
}

const tiktokOptions = v.object({ privacyLevel: v.string(), allowComments: v.boolean(), yourBrand: v.boolean(), brandedContent: v.boolean() });

/** "Post now": the exact text the preview shows, through the platform's official API. Status is live in `publishes`. */
export const publish = action({
  args: { draftId: v.id("drafts"), platform: socialPlatform, text: v.string(), tiktok: v.optional(tiktokOptions) },
  handler: async (ctx, { draftId, platform, text, tiktok }): Promise<{ url?: string; note?: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const { draft, item, source } = await ctx.runQuery(internal.social.draftForPublish, { userId, draftId });
    if (draft.platform !== draftFor(platform)) fail("INVALID_INPUT", "That draft is for another platform.");
    const post = finalPost(platform, text, draft.hashtags, item.link);
    if (!post.trim()) fail("INVALID_INPUT", "The post is empty.");
    if (postLength(platform, post) > POST_LIMITS[platform]) fail("INVALID_INPUT", `Too long for ${NAMES[platform]}. Trim it to post.`);
    if (platform === "tiktok") {
      if (!tiktok?.privacyLevel) fail("INVALID_INPUT", "Choose who can see the TikTok post.");
      if (tiktok.brandedContent && tiktok.privacyLevel === "SELF_ONLY") fail("INVALID_INPUT", "Branded content cannot be private on TikTok.");
    }

    const conn = await ctx.runQuery(internal.social.getConnection, { userId, platform });
    if (!conn) fail("FORBIDDEN", `Connect ${NAMES[platform]} first, in Connectors.`);

    const publishId: Id<"publishes"> = await ctx.runMutation(internal.social.startPublish, { userId, itemId: item._id, draftId, platform });
    try {
      const token = await freshToken(ctx, conn);
      const image = () => signedImageUrl(appUrl(), item.title, source || hostOf(item.link));
      let out;
      if (platform === "linkedin") {
        out = await publishLinkedIn(token, conn.accountId, post, item.link ? await linkedInArticle(item.link, item.title) : undefined);
      } else if (platform === "x") {
        out = await publishX(token, conn.username, post);
      } else if (platform === "instagram") {
        out = await publishInstagram(token, conn.accountId, post, image());
      } else {
        out = await publishTikTok(token, item.title, post, image(), tiktok!);
      }
      await ctx.runMutation(internal.social.finishPublish, { publishId, status: "posted", url: out.url, note: out.note });
      return { url: out.url, note: out.note };
    } catch (e) {
      const message =
        e instanceof SocialError ? `${NAMES[platform]} said: ${e.message}` : e instanceof Error && "data" in e ? String((e as { data?: { message?: string } }).data?.message ?? e.message) : "Something went wrong while posting.";
      if (e instanceof SocialError && e.code === "AUTH_EXPIRED") await ctx.runMutation(internal.social.markExpired, { connectionId: conn._id });
      await ctx.runMutation(internal.social.finishPublish, { publishId, status: "failed", error: message.slice(0, 400) });
      fail("FORBIDDEN", message);
    }
  },
});

function hostOf(u?: string): string {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** What TikTok requires the post screen to show: the creator's name and their allowed privacy levels. */
export const tiktokCreator = action({
  args: {},
  handler: async (ctx): Promise<TikTokCreator | null> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const conn = await ctx.runQuery(internal.social.getConnection, { userId, platform: "tiktok" });
    if (!conn) return null;
    try {
      return await tiktokCreatorInfo(await freshToken(ctx, conn));
    } catch (e) {
      if (e instanceof SocialError) fail("FORBIDDEN", `TikTok said: ${e.message}`);
      throw e;
    }
  },
});

/** Daily: keep Instagram's 60-day tokens alive (they can only be refreshed while still valid). */
export const refreshInstagram = internalAction({
  args: {},
  handler: async (ctx) => {
    const creds = credsFor("instagram");
    if (!creds) return;
    const ids = await ctx.runQuery(internal.social.instagramDue, {});
    for (const connectionId of ids) {
      const c = await ctx.runQuery(internal.social.connectionById, { connectionId });
      if (!c) continue;
      const next = await refreshTokens("instagram", creds, { accessToken: unseal(c.accessToken) }).catch(() => null);
      if (next) await ctx.runMutation(internal.social.updateTokens, { connectionId, ...sealTokens(next) });
    }
  },
});
