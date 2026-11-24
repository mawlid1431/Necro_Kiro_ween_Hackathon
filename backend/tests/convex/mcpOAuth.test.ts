// OAuth 2.1 for the MCP server: registration, consent, code exchange with PKCE, refresh rotation, scope, expiry, revocation,
// and that a grant is checked exactly like an API key by the MCP functions (mcpWrite.liveKey).
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { s256 } from "../../lib/mcpOAuth";

const modules = import.meta.glob("../../convex/**/*.*s");
const SECRET = "s".repeat(40);
const RESOURCE = "https://necro.test/api/mcp";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const VERIFIER = "v".repeat(20) + "-._~" + "0123456789abcdefghijklmnop";

beforeAll(() => {
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.MCP_SERVER_SECRET;
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "u_alice", tokenIdentifier: "clerk|u_alice" });
  const bob = t.withIdentity({ subject: "u_bob", tokenIdentifier: "clerk|u_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  await bob.mutation(api.users.store, {});

  const register = async (redirectUris = [REDIRECT], name = "ChatGPT") => {
    const r = await t.action(api.mcpOAuth.register, { secret: SECRET, metadata: { client_name: name, redirect_uris: redirectUris }, ipKey: "test" });
    if (!r.ok) throw new Error(r.description);
    return r.clientId;
  };
  const authorize = async (clientId: string, scope: "read" | "write" = "read", who = alice) => {
    const { code } = await who.action(api.mcpOAuth.approve, { clientId, redirectUri: REDIRECT, codeChallenge: await s256(VERIFIER), scope, resource: RESOURCE });
    return code;
  };
  const exchange = (clientId: string, code: string, over: Record<string, string> = {}) =>
    t.action(api.mcpOAuth.token, { secret: SECRET, resource: RESOURCE, grantType: "authorization_code", clientId, code, redirectUri: REDIRECT, codeVerifier: VERIFIER, ...over });
  const refresh = (clientId: string, refreshToken: string, scope?: string) =>
    t.action(api.mcpOAuth.token, { secret: SECRET, resource: RESOURCE, grantType: "refresh_token", clientId, refreshToken, scope });
  const auth = async (token: string, resource = RESOURCE) => {
    const hash = await sha(token);
    return t.mutation(api.mcpOAuth.authenticate, { secret: SECRET, hash, resource });
  };
  const connect = async (scope: "read" | "write" = "read") => {
    const clientId = await register();
    const r = await exchange(clientId, await authorize(clientId, scope));
    if (!r.ok) throw new Error(r.description);
    return { clientId, ...r };
  };
  return { t, alice, bob, aliceId, register, authorize, exchange, refresh, auth, connect };
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("MCP OAuth: issuing tokens", () => {
  it("register, approve, exchange: the access token resolves to the user and scope, like an API key", async () => {
    const { aliceId, connect, auth } = await setup();
    const r = await connect("read");
    expect(r).toMatchObject({ ok: true, scope: "read", expiresIn: 3600 });
    expect(r.accessToken).toMatch(/^necro_at_/);
    expect(r.refreshToken).toMatch(/^necro_rt_/);
    const who = await auth(r.accessToken);
    expect(who).toMatchObject({ ok: true, userId: aliceId, scope: "read" });
    if (who.ok) expect(who.prefix).toMatch(/^oauth_/);
  });

  it("stores only hashes, never raw codes or tokens", async () => {
    const { t, connect } = await setup();
    const r = await connect();
    const dump = JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("mcpGrants").collect(), await ctx.db.query("mcpCodes").collect()]));
    expect(dump).not.toContain(r.accessToken);
    expect(dump).not.toContain(r.refreshToken);
    expect(dump).not.toContain("necro_ac_");
  });

  it("refuses a wrong PKCE verifier, and the code is then burned", async () => {
    const { register, authorize, exchange } = await setup();
    const clientId = await register();
    const code = await authorize(clientId);
    expect(await exchange(clientId, code, { codeVerifier: "w".repeat(50) })).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await exchange(clientId, code)).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("refuses a missing verifier, another client, another redirect URI or another resource", async () => {
    const { register, authorize, exchange, t } = await setup();
    const clientId = await register();
    const other = await register([REDIRECT], "Other app");
    const code = await authorize(clientId);
    expect(await t.action(api.mcpOAuth.token, { secret: SECRET, resource: RESOURCE, grantType: "authorization_code", clientId, code, redirectUri: REDIRECT })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(await exchange(other, code)).toMatchObject({ ok: false, error: "invalid_grant" });
    const code2 = await authorize(clientId);
    expect(await exchange(clientId, code2, { redirectUri: "https://chatgpt.com/elsewhere" })).toMatchObject({ ok: false, error: "invalid_grant" });
    const code3 = await authorize(clientId);
    expect(await exchange(clientId, code3, { resource: "https://evil.test/api/mcp" })).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("a replayed code fails and revokes the connection it created", async () => {
    const { register, authorize, exchange, auth } = await setup();
    const clientId = await register();
    const code = await authorize(clientId);
    const first = await exchange(clientId, code);
    if (!first.ok) throw new Error("exchange");
    expect((await auth(first.accessToken)).ok).toBe(true);
    expect(await exchange(clientId, code)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await auth(first.accessToken)).toEqual({ ok: false, status: 401 });
  });

  it("an expired code fails", async () => {
    const { t, register, authorize, exchange } = await setup();
    const clientId = await register();
    const code = await authorize(clientId);
    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("mcpCodes").collect()) await ctx.db.patch(c._id, { expiresAt: Date.now() - 1 });
    });
    expect(await exchange(clientId, code)).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("rejects unknown grant types, a wrong secret and garbage codes", async () => {
    const { t, register, exchange } = await setup();
    const clientId = await register();
    expect(await t.action(api.mcpOAuth.token, { secret: SECRET, resource: RESOURCE, grantType: "client_credentials" })).toMatchObject({ ok: false, error: "unsupported_grant_type" });
    await expect(t.action(api.mcpOAuth.token, { secret: "x".repeat(40), resource: RESOURCE, grantType: "refresh_token", refreshToken: "x" })).rejects.toThrow(/Forbidden/);
    expect(await exchange(clientId, "necro_ac_nope")).toMatchObject({ ok: false, error: "invalid_grant" });
  });
});

describe("MCP OAuth: clients and consent", () => {
  it("registration refuses unsafe redirect URIs", async () => {
    const { t } = await setup();
    const r = await t.action(api.mcpOAuth.register, { secret: SECRET, metadata: { redirect_uris: ["http://evil.example/cb"] }, ipKey: "x" });
    expect(r).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    await expect(t.action(api.mcpOAuth.register, { secret: "bad".repeat(20), metadata: { redirect_uris: [REDIRECT] }, ipKey: "x" })).rejects.toThrow(/Forbidden/);
  });

  it("consent refuses an unknown client, an unregistered redirect, a bad challenge, and signed-out callers", async () => {
    const { t, alice, register } = await setup();
    const clientId = await register();
    const ok = { clientId, redirectUri: REDIRECT, codeChallenge: await s256(VERIFIER), scope: "read" as const, resource: RESOURCE };
    await expect(alice.action(api.mcpOAuth.approve, { ...ok, clientId: "necro_cl_unknown" })).rejects.toThrow(/not valid/);
    await expect(alice.action(api.mcpOAuth.approve, { ...ok, redirectUri: "https://evil.example/cb" })).rejects.toThrow(/not valid/);
    await expect(alice.action(api.mcpOAuth.approve, { ...ok, codeChallenge: "plain" })).rejects.toThrow(/PKCE/);
    await expect(t.action(api.mcpOAuth.approve, ok)).rejects.toThrow();
  });

  it("reconnecting the same app replaces its old connection", async () => {
    const { register, authorize, exchange, auth } = await setup();
    const clientId = await register();
    const a = await exchange(clientId, await authorize(clientId));
    const b = await exchange(clientId, await authorize(clientId));
    if (!a.ok || !b.ok) throw new Error("exchange");
    expect(await auth(a.accessToken)).toEqual({ ok: false, status: 401 });
    expect((await auth(b.accessToken)).ok).toBe(true);
  });
});

describe("MCP OAuth: refresh, expiry, audience, revocation", () => {
  it("refresh rotates both tokens; the old access token stops working", async () => {
    const { connect, refresh, auth } = await setup();
    const first = await connect();
    const next = await refresh(first.clientId, first.refreshToken);
    if (!next.ok) throw new Error(next.description);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(await auth(first.accessToken)).toEqual({ ok: false, status: 401 });
    expect((await auth(next.accessToken)).ok).toBe(true);
    const again = await refresh(first.clientId, next.refreshToken);
    expect(again.ok).toBe(true);
  });

  it("an old refresh token works only within the grace period; reuse after that ends the connection", async () => {
    const { t, connect, refresh, auth } = await setup();
    const first = await connect();
    const second = await refresh(first.clientId, first.refreshToken);
    if (!second.ok) throw new Error("refresh");
    const parallel = await refresh(first.clientId, first.refreshToken); // a parallel refresh inside the grace period
    expect(parallel.ok).toBe(true);
    await t.run(async (ctx) => {
      for (const g of await ctx.db.query("mcpGrants").collect()) await ctx.db.patch(g._id, { prevRefreshUntil: Date.now() - 1 });
    });
    expect(await refresh(first.clientId, first.refreshToken)).toMatchObject({ ok: false, error: "invalid_grant" });
    if (!parallel.ok) throw new Error("refresh");
    expect(await auth(parallel.accessToken)).toEqual({ ok: false, status: 401 });
    expect(await refresh(first.clientId, parallel.refreshToken)).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("refresh cannot upgrade a read-only connection or be used by another app", async () => {
    const { connect, refresh, register } = await setup();
    const r = await connect("read");
    expect(await refresh(r.clientId, r.refreshToken, "read write")).toMatchObject({ ok: false, error: "invalid_scope" });
    expect(await refresh(await register([REDIRECT], "Other app"), r.refreshToken)).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("expired access tokens and expired connections are refused", async () => {
    const { t, connect, refresh, auth } = await setup();
    const r = await connect();
    await t.run(async (ctx) => {
      for (const g of await ctx.db.query("mcpGrants").collect()) await ctx.db.patch(g._id, { accessExpiresAt: Date.now() - 1 });
    });
    expect(await auth(r.accessToken)).toEqual({ ok: false, status: 401 });
    const next = await refresh(r.clientId, r.refreshToken);
    expect(next.ok).toBe(true);
    await t.run(async (ctx) => {
      for (const g of await ctx.db.query("mcpGrants").collect()) await ctx.db.patch(g._id, { expiresAt: Date.now() - 1 });
    });
    if (!next.ok) throw new Error("refresh");
    expect(await auth(next.accessToken)).toEqual({ ok: false, status: 401 });
    expect(await refresh(r.clientId, next.refreshToken)).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("write connections expire in 90 days, read connections in a year", async () => {
    const { t, connect } = await setup();
    await connect("write");
    const g = await t.run(async (ctx) => (await ctx.db.query("mcpGrants").collect())[0]);
    expect(Math.round((g.expiresAt - g.createdAt) / 86_400_000)).toBe(90);
  });

  it("a token for another resource (audience) is refused", async () => {
    const { connect, auth } = await setup();
    const r = await connect();
    expect(await auth(r.accessToken, "https://other.test/api/mcp")).toEqual({ ok: false, status: 401 });
  });

  it("the user can disconnect in Settings; others cannot", async () => {
    const { alice, bob, connect, auth, refresh } = await setup();
    const r = await connect();
    const [g] = await alice.query(api.mcpOAuth.list, {});
    expect(g).toMatchObject({ clientName: "ChatGPT", scope: "read", revokedAt: null });
    expect(JSON.stringify(g)).not.toMatch(/Hash/);
    expect(await bob.query(api.mcpOAuth.list, {})).toEqual([]);
    await expect(bob.mutation(api.mcpOAuth.revoke, { grantId: g._id })).rejects.toThrow();
    await alice.mutation(api.mcpOAuth.revoke, { grantId: g._id });
    expect(await auth(r.accessToken)).toEqual({ ok: false, status: 401 });
    expect(await refresh(r.clientId, r.refreshToken)).toMatchObject({ ok: false, error: "invalid_grant" });
  });
});

describe("MCP OAuth: grants are checked like API keys", () => {
  it("a read-only grant can read but never post; a write grant passes the write check", async () => {
    const { t, aliceId, connect, auth } = await setup();
    const read = await auth((await connect("read")).accessToken);
    if (!read.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: read.keyId };
    expect((await t.query(api.mcpWrite.connections, k)).length).toBe(4);
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Hello", platforms: ["linkedin"] })).rejects.toThrow(/read-only/);
    await expect(t.query(api.mcpWrite.assertWriteKey, k)).rejects.toThrow(/read-only/);

    const write = await auth((await connect("write")).accessToken);
    if (!write.ok) throw new Error("auth");
    expect(write.scope).toBe("write");
    expect(await t.query(api.mcpWrite.assertWriteKey, { ...k, keyId: write.keyId })).toBe(true);
  });

  it("a revoked or foreign grant is refused by the server-side checks too", async () => {
    const { t, alice, bob, aliceId, connect, auth } = await setup();
    const w = await auth((await connect("write")).accessToken);
    if (!w.ok) throw new Error("auth");
    const bobId = await bob.query(api.users.me, {}).then((u) => u!._id as Id<"users">);
    await expect(t.query(api.mcpWrite.assertWriteKey, { secret: SECRET, userId: bobId, keyId: w.keyId })).rejects.toThrow(/not valid/);
    await alice.mutation(api.mcpOAuth.revoke, { grantId: w.keyId as Id<"mcpGrants"> });
    await expect(t.query(api.mcpWrite.assertWriteKey, { secret: SECRET, userId: aliceId, keyId: w.keyId })).rejects.toThrow(/not valid/);
  });

  it("each grant has its own 60-a-minute limit", async () => {
    const { connect, auth } = await setup();
    const r = await connect();
    for (let i = 0; i < 60; i++) expect((await auth(r.accessToken)).ok).toBe(true);
    expect(await auth(r.accessToken)).toEqual({ ok: false, status: 429 });
  });
});

describe("MCP OAuth: scale and lifecycle", () => {
  it("identical registrations share one client id, so shared-IP clients (claude.ai) never hit the new-app limit", async () => {
    const { t } = await setup();
    const reg = (name: string) => t.action(api.mcpOAuth.register, { secret: SECRET, metadata: { client_name: name, redirect_uris: [REDIRECT] }, ipKey: "shared" });
    const first = await reg("Claude");
    for (let i = 0; i < 70; i++) expect(await reg("Claude")).toMatchObject({ ok: true, clientId: first.ok ? first.clientId : "" });
    expect(await t.run((ctx) => ctx.db.query("mcpClients").collect()).then((r) => r.length)).toBe(1);
    // Many different new apps from one caller are limited.
    let limited = false;
    for (let i = 0; i < 70 && !limited; i++) limited = await reg(`App ${i}`).then(() => false, (e: Error) => /Too many/.test(e.message));
    expect(limited).toBe(true);
  });

  it("revocation (RFC 7009) by access or refresh token ends the connection; unknown or foreign tokens change nothing", async () => {
    const { t, connect, auth, register } = await setup();
    const a = await connect();
    await t.action(api.mcpOAuth.revokeToken, { secret: SECRET, token: "necro_at_" + "x".repeat(43) });
    await t.action(api.mcpOAuth.revokeToken, { secret: SECRET, token: a.accessToken, clientId: await register([REDIRECT], "Other app") });
    expect((await auth(a.accessToken)).ok).toBe(true);
    await t.action(api.mcpOAuth.revokeToken, { secret: SECRET, token: a.refreshToken, clientId: a.clientId });
    expect(await auth(a.accessToken)).toEqual({ ok: false, status: 401 });
    await expect(t.action(api.mcpOAuth.revokeToken, { secret: "y".repeat(40), token: a.accessToken })).rejects.toThrow(/Forbidden/);
  });

  it("cleanup removes ended connections, old codes and unused apps in batches, and keeps live ones", async () => {
    const { t, connect, register } = await setup();
    const live = await connect();
    const old = Date.now() - 40 * 86_400_000;
    await t.run(async (ctx) => {
      const [g] = await ctx.db.query("mcpGrants").collect();
      for (let i = 0; i < 450; i++) await ctx.db.insert("mcpGrants", { ...g, _id: undefined, _creationTime: undefined, revokedAt: old, accessHash: `a${i}`, refreshHash: `r${i}` } as never);
      for (const c of await ctx.db.query("mcpCodes").collect()) await ctx.db.patch(c._id, { expiresAt: old });
    });
    const unused = await register(["https://unused.example/cb"], "Unused");
    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("mcpClients").collect()) await ctx.db.patch(c._id, { createdAt: old });
    });
    await t.mutation(internal.mcpOAuth.cleanup, {});
    await t.finishAllScheduledFunctions(() => {});
    const left = await t.run(async (ctx) => ({
      grants: await ctx.db.query("mcpGrants").collect(),
      codes: await ctx.db.query("mcpCodes").collect(),
      clients: (await ctx.db.query("mcpClients").collect()).map((c) => c.clientId),
    }));
    expect(left.grants.length).toBe(1);
    expect(left.codes).toEqual([]);
    expect(left.clients).toContain(live.clientId);
    expect(left.clients).not.toContain(unused);
  });
});
