import { json, originOf, preflight, protectedResourceMetadata } from "@/lib/server/mcpOAuth";

// RFC 9728 metadata for the MCP server. Served at the root and at the path-suffixed form
// (/.well-known/oauth-protected-resource/api/mcp) that MCP clients try first.
export function GET(req: Request): Response {
  return json(protectedResourceMetadata(originOf(req)), 200, { "cache-control": "public, max-age=300" });
}

export const OPTIONS = preflight;
