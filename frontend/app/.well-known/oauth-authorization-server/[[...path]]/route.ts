import { authorizationServerMetadata, json, originOf, preflight } from "@/lib/server/mcpOAuth";

// RFC 8414 metadata for Necro's OAuth 2.1 authorization server (the issuer is this app's origin).
export function GET(req: Request): Response {
  return json(authorizationServerMetadata(originOf(req.url)), 200, { "cache-control": "public, max-age=300" });
}

export const OPTIONS = preflight;
