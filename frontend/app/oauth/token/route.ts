import { api } from "@backend/convex/_generated/api";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { json, matchResource, oauthError, originOf, preflight } from "@/lib/server/mcpOAuth";

// OAuth 2.1 token endpoint: authorization_code (PKCE S256 required) and refresh_token (rotated on every use).
// Public clients: no client secret. All checks happen in Convex (mcpOAuth.token); this route only parses HTTP.
export async function POST(req: Request): Promise<Response> {
  let form: URLSearchParams;
  try {
    const type = req.headers.get("content-type") ?? "";
    const text = await req.text();
    if (text.length > 8192) return oauthError("invalid_request", "Request body is too large.");
    if (type.includes("application/json")) {
      const body = JSON.parse(text) as Record<string, unknown>;
      form = new URLSearchParams(Object.entries(body).filter(([, v]) => typeof v === "string") as [string, string][]);
    } else {
      form = new URLSearchParams(text);
    }
  } catch {
    return oauthError("invalid_request", "Send the parameters as application/x-www-form-urlencoded.");
  }
  if (req.headers.get("authorization")?.toLowerCase().startsWith("basic ")) {
    return oauthError("invalid_client", "Necro registers public clients only: send client_id in the body, without a secret.", 401);
  }

  const origin = originOf(req);
  const resource = matchResource(form.get("resource"), origin);
  if (!resource) return oauthError("invalid_target", "Tokens can only be issued for this server's MCP endpoint.");

  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    return oauthError("temporarily_unavailable", "Necro's MCP server is not configured.", 503);
  }
  const opt = (k: string) => form.get(k) ?? undefined;
  let r;
  try {
    r = await convexServer().action(api.mcpOAuth.token, {
      secret,
      resource,
      grantType: form.get("grant_type") ?? "",
      clientId: opt("client_id"),
      code: opt("code"),
      redirectUri: opt("redirect_uri"),
      codeVerifier: opt("code_verifier"),
      refreshToken: opt("refresh_token"),
      scope: opt("scope"),
    });
  } catch {
    return oauthError("temporarily_unavailable", "Necro is unavailable. Try again shortly.", 503);
  }
  // One line per token event for operations: never tokens, codes or client ids.
  console.log(JSON.stringify({ ev: "oauth", step: form.get("grant_type"), status: r.ok ? "ok" : r.error }));
  if (!r.ok) return oauthError(r.error, r.description);
  return json({ access_token: r.accessToken, token_type: "Bearer", expires_in: r.expiresIn, refresh_token: r.refreshToken, scope: r.scope }, 200, { pragma: "no-cache" });
}

export const OPTIONS = preflight;
