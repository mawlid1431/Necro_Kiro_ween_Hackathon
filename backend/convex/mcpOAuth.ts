// OAuth 2.1 authorization server for the MCP server, so ChatGPT and claude.ai connectors can connect without an API key.
// The Next.js routes (frontend/app/oauth/*, frontend/app/.well-known/*) are thin: they parse HTTP and call these functions.
// Public functions called by those routes check MCP_SERVER_SECRET first, like mcp.ts. The consent step runs as the
// signed-in user (Clerk via Convex auth). Secrets (codes, tokens, client ids) are made in actions, where randomness is
// real, and only their SHA-256 is stored. A grant resolves to the same { userId, keyId, scope } as an API key, so
// mcpWrite.liveKey and the tools treat both the same way.

import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { assertSecret, fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { hitLimit } from "./rateLimits";
import { MCP_CALLS_PER_MINUTE } from "../lib/limits";
import {
  ACCESS_TOKEN_SECONDS,
  CODE_SECONDS,
  GRANT_DAYS,
  MAX_GRANTS_PER_USER,
  REFRESH_GRACE_MS,
  TOKEN_RE,
  cleanClientMetadata,
  grantLabel,
  randomToken,
  redirectAllowed,
  scopeString,
  sha256Hex,
  validChallenge,
  verifyPkce,
} from "../lib/mcpOAuth";

const scopeV = v.union(v.literal("read"), v.literal("write"));

// ---------- clients ----------

export const getClient = internalQuery({
  args: { clientId: v.string() },
  handler: (ctx, { clientId }) => ctx.db.query("mcpClients").withIndex("by_client_id", (q) => q.eq("clientId", clientId)).unique(),
});

/** Saves a fetched Client ID Metadata Document (called by mcpOAuthNode.describeClient). */
export const saveCimdClient = internalMutation({
  args: { clientId: v.string(), name: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, { clientId, name, redirectUris }) => {
    const now = Date.now();
    const row = await ctx.db.query("mcpClients").withIndex("by_client_id", (q) => q.eq("clientId", clientId)).unique();
    if (row) await ctx.db.patch(row._id, { name, redirectUris, fetchedAt: now });
    else await ctx.db.insert("mcpClients", { clientId, kind: "cimd", name, redirectUris, createdAt: now, fetchedAt: now });
  },
});

/** How many distinct new apps may register per hour, per caller and in total. Repeat registrations are free. */
export const DCR_NEW_PER_CALLER_HOUR = 60;
export const DCR_NEW_TOTAL_HOUR = 1000;

/**
 * Stores a DCR client, or returns the existing id for an identical registration. claude.ai (and others) register from
 * shared server IPs once per user connection, so dedupe keeps the table small and the limits only apply to new apps.
 */
export const saveDcrClient = internalMutation({
  args: { clientId: v.string(), name: v.string(), redirectUris: v.array(v.string()), fingerprint: v.string(), ipKey: v.string() },
  handler: async (ctx, { clientId, name, redirectUris, fingerprint, ipKey }): Promise<{ clientId: string; createdAt: number }> => {
    const same = await ctx.db.query("mcpClients").withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint)).first();
    if (same) return { clientId: same.clientId, createdAt: same.createdAt };
    if (
      !(await hitLimit(ctx, `mcpreg:${ipKey}`, DCR_NEW_PER_CALLER_HOUR, 3_600_000)) ||
      !(await hitLimit(ctx, "mcpreg:all", DCR_NEW_TOTAL_HOUR, 3_600_000))
    ) {
      fail("LIMIT", "Too many app registrations. Try again in an hour.");
    }
    const createdAt = Date.now();
    await ctx.db.insert("mcpClients", { clientId, kind: "dcr", name, redirectUris, fingerprint, createdAt });
    return { clientId, createdAt };
  },
});

/** Caps how often Necro fetches client metadata documents, per host and in total (no fetch amplification). */
export const allowCimdFetch = internalMutation({
  args: { host: v.string() },
  handler: async (ctx, { host }) =>
    (await hitLimit(ctx, `mcpcimd:${host.slice(0, 200)}`, 60, 3_600_000)) && (await hitLimit(ctx, "mcpcimd:all", 1000, 3_600_000)),
});

type RegisterResult =
  | { ok: true; clientId: string; name: string; redirectUris: string[]; issuedAt: number }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** Dynamic Client Registration (RFC 7591), called by /oauth/register. Public clients only. */
export const register = action({
  args: { secret: v.string(), metadata: v.any(), ipKey: v.string() },
  handler: async (ctx, { secret, metadata, ipKey }): Promise<RegisterResult> => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    const clean = cleanClientMetadata(metadata);
    if ("error" in clean) {
      return { ok: false, error: /redirect/i.test(clean.error) ? "invalid_redirect_uri" : "invalid_client_metadata", description: clean.error };
    }
    const fingerprint = await sha256Hex(JSON.stringify([clean.name, [...clean.redirectUris].sort()]));
    const saved = await ctx.runMutation(internal.mcpOAuth.saveDcrClient, {
      clientId: randomToken("necro_cl_"),
      name: clean.name,
      redirectUris: clean.redirectUris,
      fingerprint,
      ipKey: ipKey.slice(0, 80),
    });
    return { ok: true, clientId: saved.clientId, name: clean.name, redirectUris: clean.redirectUris, issuedAt: Math.floor(saved.createdAt / 1000) };
  },
});

// ---------- consent (the signed-in user approves) ----------

async function activeGrants(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"mcpGrants">[]> {
  const now = Date.now();
  const rows = await ctx.db.query("mcpGrants").withIndex("by_user", (q) => q.eq("userId", userId)).take(200);
  return rows.filter((g) => !g.revokedAt && g.expiresAt > now);
}

export const issueCode = internalMutation({
  args: {
    userId: v.id("users"),
    hash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    challenge: v.string(),
    scope: scopeV,
    resource: v.string(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.query("mcpClients").withIndex("by_client_id", (q) => q.eq("clientId", args.clientId)).unique();
    if (!client || !redirectAllowed(client.redirectUris, args.redirectUri)) fail("INVALID_INPUT", "This app's sign-in link is not valid. Start again from the app.");
    if (!validChallenge(args.challenge)) fail("INVALID_INPUT", "This app did not send a valid PKCE challenge.");
    if (!(await hitLimit(ctx, `mcpapprove:${args.userId}`, 30, 3_600_000))) fail("LIMIT", "Too many approvals in an hour. Try again later.");
    const others = (await activeGrants(ctx, args.userId)).filter((g) => g.clientId !== args.clientId);
    if (others.length >= MAX_GRANTS_PER_USER) {
      fail("LIMIT", `You can have up to ${MAX_GRANTS_PER_USER} connected apps. Disconnect one in Settings first.`);
    }
    await ctx.db.insert("mcpCodes", { ...args, expiresAt: Date.now() + CODE_SECONDS * 1000 });
  },
});

/** The user approved: returns a one-time authorization code for the app's redirect. */
export const approve = action({
  args: { clientId: v.string(), redirectUri: v.string(), codeChallenge: v.string(), scope: scopeV, resource: v.string() },
  handler: async (ctx, { clientId, redirectUri, codeChallenge, scope, resource }): Promise<{ code: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const code = randomToken("necro_ac_");
    await ctx.runMutation(internal.mcpOAuth.issueCode, {
      userId,
      hash: await sha256Hex(code),
      clientId,
      redirectUri,
      challenge: codeChallenge,
      scope,
      resource: resource.slice(0, 300),
    });
    return { code };
  },
});

// ---------- token endpoint ----------

type TokenError = { ok: false; error: "invalid_request" | "invalid_grant" | "unsupported_grant_type" | "invalid_scope"; description: string };
type TokenResult = { ok: true; accessToken: string; refreshToken: string; scope: string; expiresIn: number } | TokenError;
type GrantResult = { ok: true; scope: "read" | "write" } | TokenError;

const bad = (description: string): TokenError => ({ ok: false, error: "invalid_grant", description });

export const exchangeCode = internalMutation({
  args: {
    codeHash: v.string(),
    verifier: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    resource: v.string(),
    accessHash: v.string(),
    refreshHash: v.string(),
  },
  handler: async (ctx, a): Promise<GrantResult> => {
    const now = Date.now();
    const code = await ctx.db.query("mcpCodes").withIndex("by_hash", (q) => q.eq("hash", a.codeHash)).unique();
    if (!code) return bad("Unknown authorization code.");
    if (code.usedAt) {
      // A replayed code means it leaked: revoke what it produced (RFC 9700 section 4.2.4 / OAuth 2.1).
      if (code.grantId) {
        const g = await ctx.db.get(code.grantId);
        if (g && !g.revokedAt) await ctx.db.patch(g._id, { revokedAt: now });
      }
      return bad("This authorization code was already used.");
    }
    if (code.expiresAt <= now) return bad("This authorization code has expired.");
    if (code.clientId !== a.clientId) return bad("This code was issued to a different app.");
    if (code.redirectUri !== a.redirectUri) return bad("redirect_uri does not match the authorization request.");
    if (code.resource !== a.resource) return bad("This code was issued for a different resource.");
    if (!(await verifyPkce(a.verifier, code.challenge))) {
      await ctx.db.patch(code._id, { usedAt: now }); // one guess per code
      return bad("PKCE verification failed.");
    }
    const client = await ctx.db.query("mcpClients").withIndex("by_client_id", (q) => q.eq("clientId", a.clientId)).unique();
    if (!client) return bad("Unknown app.");

    // Reconnecting the same app replaces its old connection.
    const old = await ctx.db.query("mcpGrants").withIndex("by_user_client", (q) => q.eq("userId", code.userId).eq("clientId", a.clientId)).take(50);
    for (const g of old) if (!g.revokedAt) await ctx.db.patch(g._id, { revokedAt: now });

    const grantId = await ctx.db.insert("mcpGrants", {
      userId: code.userId,
      clientId: a.clientId,
      clientName: client.name,
      scope: code.scope,
      resource: code.resource,
      createdAt: now,
      expiresAt: now + GRANT_DAYS[code.scope] * 86_400_000,
      accessHash: a.accessHash,
      accessExpiresAt: now + ACCESS_TOKEN_SECONDS * 1000,
      refreshHash: a.refreshHash,
    });
    await ctx.db.patch(code._id, { usedAt: now, grantId });
    return { ok: true, scope: code.scope };
  },
});

export const rotateRefresh = internalMutation({
  args: { refreshHash: v.string(), clientId: v.optional(v.string()), wantWrite: v.boolean(), accessHash: v.string(), newRefreshHash: v.string() },
  handler: async (ctx, a): Promise<GrantResult> => {
    const now = Date.now();
    let grant = await ctx.db.query("mcpGrants").withIndex("by_refresh", (q) => q.eq("refreshHash", a.refreshHash)).unique();
    let viaPrevious = false;
    if (!grant) {
      grant = await ctx.db.query("mcpGrants").withIndex("by_prev_refresh", (q) => q.eq("prevRefreshHash", a.refreshHash)).first();
      if (!grant) return bad("Unknown refresh token.");
      if (!grant.prevRefreshUntil || grant.prevRefreshUntil < now) {
        // An old refresh token came back after rotation: treat it as stolen and end the connection.
        if (!grant.revokedAt) await ctx.db.patch(grant._id, { revokedAt: now });
        return bad("This refresh token was already used.");
      }
      viaPrevious = true;
    }
    if (grant.revokedAt) return bad("This connection was disconnected in Necro Settings.");
    if (grant.expiresAt <= now) return bad("This connection has expired. Connect again.");
    if (a.clientId !== undefined && a.clientId !== grant.clientId) return bad("This refresh token belongs to a different app.");
    if (a.wantWrite && grant.scope !== "write") return { ok: false, error: "invalid_scope", description: "This connection is read-only. Connect again and choose \"Read and write\"." };
    if (!(await hitLimit(ctx, `mcprefresh:${grant._id}`, 60, 3_600_000))) return { ok: false, error: "invalid_request", description: "Too many refreshes. Try again later." };

    await ctx.db.patch(grant._id, {
      accessHash: a.accessHash,
      accessExpiresAt: now + ACCESS_TOKEN_SECONDS * 1000,
      refreshHash: a.newRefreshHash,
      // Keep the token being replaced usable for a short grace period (parallel refreshes); a grace-period use keeps the original window.
      prevRefreshHash: viaPrevious ? grant.prevRefreshHash : grant.refreshHash,
      prevRefreshUntil: viaPrevious ? grant.prevRefreshUntil : now + REFRESH_GRACE_MS,
    });
    return { ok: true, scope: grant.scope };
  },
});

/** The token endpoint (authorization_code with PKCE, and refresh_token with rotation). Called by /oauth/token. */
export const token = action({
  args: {
    secret: v.string(),
    resource: v.string(), // this MCP server's canonical URL; the route already checked the client's `resource` matches it
    grantType: v.string(),
    clientId: v.optional(v.string()),
    code: v.optional(v.string()),
    redirectUri: v.optional(v.string()),
    codeVerifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<TokenResult> => {
    assertSecret(a.secret, "MCP_SERVER_SECRET");
    const accessToken = randomToken("necro_at_");
    const refreshToken = randomToken("necro_rt_");
    let r: GrantResult;
    if (a.grantType === "authorization_code") {
      if (!a.code || !a.redirectUri || !a.codeVerifier || !a.clientId) {
        return { ok: false, error: "invalid_request", description: "code, redirect_uri, client_id and code_verifier are required." };
      }
      if (!TOKEN_RE.code.test(a.code)) return bad("Unknown authorization code.");
      r = await ctx.runMutation(internal.mcpOAuth.exchangeCode, {
        codeHash: await sha256Hex(a.code),
        verifier: a.codeVerifier,
        clientId: a.clientId,
        redirectUri: a.redirectUri,
        resource: a.resource,
        accessHash: await sha256Hex(accessToken),
        refreshHash: await sha256Hex(refreshToken),
      });
    } else if (a.grantType === "refresh_token") {
      if (!a.refreshToken) return { ok: false, error: "invalid_request", description: "refresh_token is required." };
      if (!TOKEN_RE.refresh.test(a.refreshToken)) return bad("Unknown refresh token.");
      r = await ctx.runMutation(internal.mcpOAuth.rotateRefresh, {
        refreshHash: await sha256Hex(a.refreshToken),
        clientId: a.clientId,
        wantWrite: (a.scope ?? "").split(/\s+/).includes("write"),
        accessHash: await sha256Hex(accessToken),
        newRefreshHash: await sha256Hex(refreshToken),
      });
    } else {
      return { ok: false, error: "unsupported_grant_type", description: "Use authorization_code or refresh_token." };
    }
    if (!r.ok) return r;
    return { ok: true, accessToken, refreshToken, scope: scopeString(r.scope), expiresIn: ACCESS_TOKEN_SECONDS };
  },
});

// ---------- the MCP route: access token -> user ----------

/** Same contract as mcp.authenticate (API keys): resolves an access token hash, checks audience and expiry, 60 calls a minute. */
export const authenticate = mutation({
  args: { hash: v.string(), secret: v.string(), resource: v.string() },
  handler: async (ctx, { hash, secret, resource }) => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false as const, status: 401 };
    const grant = await ctx.db.query("mcpGrants").withIndex("by_access", (q) => q.eq("accessHash", hash)).unique();
    const now = Date.now();
    if (!grant || grant.revokedAt || grant.expiresAt <= now || grant.accessExpiresAt <= now) return { ok: false as const, status: 401 };
    if (grant.resource !== resource) return { ok: false as const, status: 401 }; // a token for another audience
    if (!(await hitLimit(ctx, `mcp:${grant._id}`, MCP_CALLS_PER_MINUTE, 60_000))) return { ok: false as const, status: 429 };
    if (!grant.lastUsedAt || now - grant.lastUsedAt > 60_000) await ctx.db.patch(grant._id, { lastUsedAt: now });
    return { ok: true as const, userId: grant.userId, prefix: grantLabel(grant._id), keyId: grant._id, scope: grant.scope };
  },
});

// ---------- Settings ----------

/** The user's connected apps (never token hashes). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("mcpGrants").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(50);
    return rows.map((g) => ({
      _id: g._id,
      clientName: g.clientName,
      label: grantLabel(g._id),
      scope: g.scope,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      lastUsedAt: g.lastUsedAt ?? null,
      revokedAt: g.revokedAt ?? null,
    }));
  },
});

export const revoke = mutation({
  args: { grantId: v.id("mcpGrants") },
  handler: async (ctx, { grantId }) => {
    const user = await requireUser(ctx);
    const grant = await requireOwned(ctx, user._id, grantId);
    if (!grant.revokedAt) await ctx.db.patch(grantId, { revokedAt: Date.now() });
  },
});

/** RFC 7009 token revocation (/oauth/revoke): an app disconnecting itself ends the whole connection. */
export const revokeByToken = internalMutation({
  args: { hash: v.string(), clientId: v.optional(v.string()) },
  handler: async (ctx, { hash, clientId }) => {
    const grant =
      (await ctx.db.query("mcpGrants").withIndex("by_access", (q) => q.eq("accessHash", hash)).unique()) ??
      (await ctx.db.query("mcpGrants").withIndex("by_refresh", (q) => q.eq("refreshHash", hash)).unique());
    if (!grant || grant.revokedAt) return;
    if (clientId !== undefined && clientId !== grant.clientId) return; // another app's token: ignore silently (RFC 7009 2.1)
    await ctx.db.patch(grant._id, { revokedAt: Date.now() });
  },
});

export const revokeToken = action({
  args: { secret: v.string(), token: v.string(), clientId: v.optional(v.string()) },
  handler: async (ctx, { secret, token, clientId }) => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    // Unknown tokens get the same answer as known ones (RFC 7009 2.2), so this endpoint reveals nothing.
    if (TOKEN_RE.access.test(token) || TOKEN_RE.refresh.test(token)) {
      await ctx.runMutation(internal.mcpOAuth.revokeByToken, { hash: await sha256Hex(token), clientId });
    }
    return null;
  },
});

const CLEANUP_BATCH = 200;
const KEEP_ENDED_MS = 30 * 86_400_000;

/**
 * Daily, in batches that reschedule themselves until done (so it keeps up however many users there are): drops
 * expired authorization codes, connections that ended (revoked or expired) over 30 days ago, and registered apps
 * older than 30 days that have no connection.
 */
export const cleanup = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    let more = false;
    if (cursor === undefined) {
      const codes = await ctx.db.query("mcpCodes").withIndex("by_expires", (q) => q.lt("expiresAt", now - 86_400_000)).take(CLEANUP_BATCH);
      const expired = await ctx.db.query("mcpGrants").withIndex("by_expires", (q) => q.lt("expiresAt", now - KEEP_ENDED_MS)).take(CLEANUP_BATCH);
      const revoked = await ctx.db.query("mcpGrants").withIndex("by_revoked", (q) => q.gt("revokedAt", 0).lt("revokedAt", now - KEEP_ENDED_MS)).take(CLEANUP_BATCH);
      for (const row of [...codes, ...expired, ...revoked]) if (await ctx.db.get(row._id)) await ctx.db.delete(row._id);
      more = codes.length === CLEANUP_BATCH || expired.length === CLEANUP_BATCH || revoked.length === CLEANUP_BATCH;
      if (more) {
        await ctx.scheduler.runAfter(0, internal.mcpOAuth.cleanup, {});
        return;
      }
    }
    const page = await ctx.db
      .query("mcpClients")
      .withIndex("by_kind_created", (q) => q.eq("kind", "dcr").lt("createdAt", now - KEEP_ENDED_MS))
      .paginate({ numItems: CLEANUP_BATCH, cursor: cursor ?? null });
    for (const c of page.page) {
      const hasGrant = await ctx.db.query("mcpGrants").withIndex("by_client", (q) => q.eq("clientId", c.clientId)).first();
      if (!hasGrant) await ctx.db.delete(c._id);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.mcpOAuth.cleanup, { cursor: page.continueCursor });
  },
});
