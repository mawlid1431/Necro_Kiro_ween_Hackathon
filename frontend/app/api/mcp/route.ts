import { createHash } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { api } from "@backend/convex/_generated/api";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { buildServer } from "./tools";

// MCP server "Talk to the Dead": Streamable HTTP in stateless mode (one server per request,
// no sessions to store). Auth: `Authorization: Bearer necro_sk_...` (a key from Settings).
// The key is hashed here and resolved to a user by a secret-guarded Convex mutation that
// also enforces 60 requests a minute, before any MCP work happens.


// Runs on the Node.js runtime (the default; `runtime` cannot be set with cacheComponents).
export const maxDuration = 60;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.match(/^Bearer\s+(necro_sk_[A-Za-z0-9]{20,64})\s*$/)?.[1];
  if (!key) {
    return jsonRpcError(401, "Missing or malformed API key. Create one in Necro Settings.", { "www-authenticate": 'Bearer realm="necro"' });
  }

  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    console.error(JSON.stringify({ ev: "mcp", status: "misconfigured" })); // never echo config details to callers
    return jsonRpcError(503, "The MCP server is not configured.");
  }

  const convex = convexServer();
  const hash = createHash("sha256").update(key).digest("hex");
  let who;
  try {
    who = await convex.mutation(api.mcp.authenticate, { hash, secret });
  } catch {
    return jsonRpcError(503, "Necro is unavailable. Try again shortly.");
  }
  if (!who.ok) {
    return who.status === 429
      ? jsonRpcError(429, "Rate limit: 60 requests a minute per key.", { "retry-after": "60" })
      : jsonRpcError(401, "Invalid or revoked API key.", { "www-authenticate": 'Bearer realm="necro"' });
  }

  const server = buildServer({ convex, secret, userId: who.userId, keyPrefix: who.prefix });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
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
