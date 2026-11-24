// OAuth 2.1 for the MCP server ("Talk to the Dead"): pure helpers shared by Convex (backend/convex/mcpOAuth.ts)
// and unit tests. No I/O here. Web Crypto only, so it runs in Convex queries, mutations, actions and Node.

export type McpScope = "read" | "write";

/** Access tokens live an hour; the client refreshes them with the refresh token. */
export const ACCESS_TOKEN_SECONDS = 3600;
/** Authorization codes are single-use and short-lived. */
export const CODE_SECONDS = 600;
/** A grant (the connection) ends after this, like API keys: write expires sooner because it can post as the user. */
export const GRANT_DAYS: Record<McpScope, number> = { read: 365, write: 90 };
/** After a refresh, the previous refresh token still works this long (two parallel refreshes must not log the user out). */
export const REFRESH_GRACE_MS = 60_000;
/** Active connections per user; reconnecting the same client replaces its old connection instead of counting twice. */
export const MAX_GRANTS_PER_USER = 10;
/** A fetched client metadata document (CIMD) is trusted for this long, then fetched again. */
export const CIMD_TTL_MS = 24 * 3_600_000;

/** Raw token formats (the raw value is never stored, only its SHA-256). */
export const TOKEN_RE = {
  access: /^necro_at_[A-Za-z0-9_-]{43}$/,
  refresh: /^necro_rt_[A-Za-z0-9_-]{43}$/,
  code: /^necro_ac_[A-Za-z0-9_-]{43}$/,
} as const;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A random token: prefix + 32 CSPRNG bytes in base64url (43 chars). Call it only where randomness is real (actions, Node). */
export function randomToken(prefix: "necro_at_" | "necro_rt_" | "necro_ac_" | "necro_cl_"): string {
  return prefix + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

// ---------- PKCE (RFC 7636, S256 only) ----------

const PKCE_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

export function validChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(challenge); // base64url SHA-256, no padding
}

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** True when `verifier` is well formed and hashes to `challenge`. */
export async function verifyPkce(verifier: string, challenge: string): Promise<boolean> {
  if (!PKCE_RE.test(verifier) || !validChallenge(challenge)) return false;
  const got = await s256(verifier);
  let diff = got.length ^ challenge.length;
  for (let i = 0; i < Math.max(got.length, challenge.length); i++) diff |= (got.charCodeAt(i) || 0) ^ (challenge.charCodeAt(i) || 0);
  return diff === 0;
}

// ---------- scopes ----------

/** "read", "write", "read write" or nothing. Unknown scopes are ignored (clients often add their own). */
export function requestedScope(scope: string | null | undefined): McpScope {
  return (scope ?? "").split(/\s+/).includes("write") ? "write" : "read";
}

/** The OAuth `scope` string for a grant: write includes read. */
export function scopeString(scope: McpScope): string {
  return scope === "write" ? "read write" : "read";
}

// ---------- redirect URIs and client ids ----------

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Redirect URIs a client may register: https anywhere, or http on loopback (local tools like the MCP Inspector).
 * No fragments, no credentials, no custom schemes.
 */
export function validRedirectUri(raw: string): boolean {
  if (raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password || raw.includes("#")) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK.has(u.hostname);
}

/** Exact string match, except a loopback redirect may use any port (RFC 8252 section 7.3). */
export function redirectAllowed(registered: readonly string[], given: string): boolean {
  if (registered.includes(given)) return true;
  let g: URL;
  try {
    g = new URL(given);
  } catch {
    return false;
  }
  if (g.protocol !== "http:" || !LOOPBACK.has(g.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === g.hostname && u.pathname === g.pathname && u.search === g.search;
    } catch {
      return false;
    }
  });
}

/** A client id that is a Client ID Metadata Document URL: https with a path (draft-ietf-oauth-client-id-metadata-document). */
export function isCimdClientId(clientId: string): boolean {
  if (clientId.length > 500 || !clientId.startsWith("https://")) return false;
  try {
    const u = new URL(clientId);
    return u.pathname.length > 1 && !u.hash && !u.username && !u.password && !u.search;
  } catch {
    return false;
  }
}

export interface ClientMetadata {
  name: string;
  redirectUris: string[];
}

/** Checks a client's metadata (from DCR or a CIMD). Returns an error sentence or the cleaned metadata. */
export function cleanClientMetadata(doc: unknown, expectedClientId?: string): ClientMetadata | { error: string } {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "Client metadata must be a JSON object." };
  const d = doc as Record<string, unknown>;
  if (expectedClientId !== undefined && d.client_id !== expectedClientId) return { error: "client_id in the document does not match its URL." };
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) return { error: "redirect_uris must list 1 to 10 URIs." };
  if (!uris.every((u) => typeof u === "string" && validRedirectUri(u))) return { error: "Each redirect URI must be https (or http on localhost)." };
  const method = d.token_endpoint_auth_method;
  // Public clients only (PKCE). A client that also supports other methods lists them in *_supported, which is fine.
  if (method !== undefined && method !== "none") {
    const supported = d.token_endpoint_auth_methods_supported;
    if (!Array.isArray(supported) || !supported.includes("none")) return { error: "Necro supports public clients only (token_endpoint_auth_method \"none\" with PKCE)." };
  }
  const rawName = typeof d.client_name === "string" ? d.client_name : "";
  const name = rawName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
  return { name: name || hostOf(uris[0] as string), redirectUris: [...new Set(uris as string[])] };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "an app";
  }
}

/** The label used in logs and on posts made through a grant (like an API key's prefix). */
export function grantLabel(grantId: string): string {
  return `oauth_${grantId.slice(-8)}`;
}
