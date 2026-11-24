import { createHash } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { api } from "@backend/convex/_generated/api";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { CORS, originOf, preflight, resourceFor, resourceMetadataUrl } from "@/lib/server/mcpOAuth";
import { buildServer } from "./tools";

// MCP server "Talk to the Dead": Streamable HTTP in stateless mode (one server per request,
// no sessions to store). Two ways in, both resolving to the same { userId, keyId, scope }:
// - `Authorization: Bearer necro_sk_...`: a personal key from Settings;
// - `Authorization: Bearer necro_at_...`: an OAuth 2.1 access token (ChatGPT / claude.ai connectors, see /oauth/*).
// The token is hashed here and resolved to a user by a secret-guarded Convex mutation that
// also enforces 60 requests a minute, before any MCP work happens.

// Runs on the Node.js runtime (the default; `runtime` cannot be set with cacheComponents).
export const maxDuration = 60;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...headers },
  });
}

/** RFC 6750 / RFC 9728 challenge: tells OAuth clients where to discover how to sign in. */
function challenge(origin: string, error?: string): Record<string, string> {
  const parts = [`Bearer realm="necro"`, `resource_metadata="${resourceMetadataUrl(origin)}"`];
  if (error) parts.push(`error="${error}"`);
  return { "www-authenticate": parts.join(", ") };
}

export async function POST(req: Request): Promise<Response> {
  const origin = originOf(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.match(/^Bearer\s+(necro_sk_[A-Za-z0-9]{20,64})\s*$/)?.[1];
  const access = auth.match(/^Bearer\s+(necro_at_[A-Za-z0-9_-]{43})\s*$/)?.[1];
  if (!key && !access) {
    return jsonRpcError(401, "Sign in with Necro (OAuth) or send an API key from Necro Settings.", challenge(origin, auth ? "invalid_token" : undefined));
  }

  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    console.error(JSON.stringify({ ev: "mcp", status: "misconfigured" })); // never echo config details to callers
    return jsonRpcError(503, "The MCP server is not configured.");
  }

  const convex = convexServer();
  const hash = createHash("sha256").update((key ?? access)!).digest("hex");
  let who;
  try {
    who = key
      ? await convex.mutation(api.mcp.authenticate, { hash, secret })
      : await convex.mutation(api.mcpOAuth.authenticate, { hash, secret, resource: resourceFor(origin) });
  } catch {
    return jsonRpcError(503, "Necro is unavailable. Try again shortly.");
  }
  if (!who.ok) {
    return who.status === 429
      ? jsonRpcError(429, "Rate limit: 60 requests a minute per key.", { "retry-after": "60" })
      : jsonRpcError(401, key ? "Invalid, expired or revoked API key." : "This connection expired or was disconnected. Sign in again.", challenge(origin, "invalid_token"));
  }

  const server = buildServer({ convex, secret, userId: who.userId, keyPrefix: who.prefix, keyId: who.keyId, scope: who.scope });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  } finally {
    // Stateless: nothing outlives the request.
    void transport.close();
    void server.close();
  }
}

// Stateless mode has no server-initiated stream or session to delete.
export function GET(): Response {
  return jsonRpcError(405, "Use POST. This server is stateless.", { allow: "POST" });
}

export function DELETE(): Response {
  return jsonRpcError(405, "Use POST. This server is stateless.", { allow: "POST" });
}

export const OPTIONS = preflight;
