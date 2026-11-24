import "server-only";

// Shared bits of Necro's OAuth 2.1 authorization server for MCP (see backend/convex/mcpOAuth.ts).
// The issuer is this app's origin; the protected resource is <origin>/api/mcp.

/** This app's public origin. MCP_PUBLIC_ORIGIN wins (for a tunnel in local testing); otherwise the request's own origin. */
export function originOf(reqUrl: string): string {
  const override = process.env.MCP_PUBLIC_ORIGIN?.replace(/\/+$/, "");
  if (override) return override;
  return new URL(reqUrl).origin;
}

/** Same as originOf, for server components (no Request object). */
export function originFromHeaders(h: Headers): string {
  const override = process.env.MCP_PUBLIC_ORIGIN?.replace(/\/+$/, "");
  if (override) return override;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

export const MCP_PATH = "/api/mcp";
export const resourceFor = (origin: string) => `${origin}${MCP_PATH}`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
export const SCOPES = ["read", "write"] as const;

/**
 * The client's `resource` parameter (RFC 8707) must name this MCP server. Accepts the exact URL or the bare origin
 * (some clients send the origin), ignoring a trailing slash. Returns the canonical resource, or null if it is another one.
 */
export function matchResource(given: string | null | undefined, origin: string): string | null {
  const canonical = resourceFor(origin);
  if (!given) return canonical;
  const g = given.replace(/\/+$/, "");
  return g === canonical || g === origin ? canonical : null;
}

// Bearer tokens, never cookies, so any origin may call these endpoints (browser-based MCP clients and inspectors).
export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...headers },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

/** RFC 9728 protected resource metadata. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceFor(origin),
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Necro: Talk to the Dead",
    resource_documentation: `${origin}/settings#keys`,
  };
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    // RFC 9207: every authorization response carries `iss` (lets ChatGPT use its stable redirect URI).
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/settings#keys`,
  };
}

/** Best-effort caller key for rate limiting open registration (never logged or stored beyond the limiter key). */
export function callerKey(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}
