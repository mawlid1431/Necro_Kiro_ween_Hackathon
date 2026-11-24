import { json, preflight } from "@/lib/server/mcpOAuth";

// Necro is an OAuth 2.1 authorization server, not an OpenID Connect provider. Some MCP clients probe
// this URL first; a clear JSON 404 (instead of the HTML not-found page) makes them fall back to
// /.well-known/oauth-authorization-server cleanly.
export function GET(): Response {
  return json({ error: "not_found", error_description: "Necro does not offer OpenID Connect. Use /.well-known/oauth-authorization-server." }, 404, {
    "cache-control": "public, max-age=300",
  });
}

export const OPTIONS = preflight;
