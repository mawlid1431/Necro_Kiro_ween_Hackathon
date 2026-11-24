import { api } from "@backend/convex/_generated/api";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { json, oauthError, preflight } from "@/lib/server/mcpOAuth";

// RFC 7009 token revocation. When ChatGPT or Claude disconnects, the whole Necro connection ends at once.
// The answer is the same 200 for known and unknown tokens, so this endpoint reveals nothing.
export async function POST(req: Request): Promise<Response> {
  const text = await req.text().catch(() => "");
  if (text.length > 4096) return oauthError("invalid_request", "Request body is too large.");
  const form = new URLSearchParams(text);
  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required.");
  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    return oauthError("temporarily_unavailable", "Necro's MCP server is not configured.", 503);
  }
  try {
    await convexServer().action(api.mcpOAuth.revokeToken, { secret, token, clientId: form.get("client_id") ?? undefined });
  } catch {
    return oauthError("temporarily_unavailable", "Necro is unavailable. Try again shortly.", 503);
  }
  console.log(JSON.stringify({ ev: "oauth", step: "revoke", status: "ok" }));
  return json({});
}

export const OPTIONS = preflight;
