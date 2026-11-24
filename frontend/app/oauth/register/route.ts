import { createHash } from "node:crypto";
import { ConvexError } from "convex/values";
import { api } from "@backend/convex/_generated/api";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { callerKey, json, oauthError, preflight } from "@/lib/server/mcpOAuth";

// Dynamic Client Registration (RFC 7591) for MCP clients that do not use a Client ID Metadata Document.
// Public clients only (PKCE, token_endpoint_auth_method "none"). Rate-limited per caller in Convex.
export async function POST(req: Request): Promise<Response> {
  let metadata: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_384) return oauthError("invalid_client_metadata", "Registration body is too large.");
    metadata = JSON.parse(text);
  } catch {
    return oauthError("invalid_client_metadata", "Send the client metadata as JSON.");
  }
  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    return oauthError("temporarily_unavailable", "Necro's MCP server is not configured.", 503);
  }
  const ipKey = createHash("sha256").update(callerKey(req)).digest("hex").slice(0, 24);
  try {
    const r = await convexServer().action(api.mcpOAuth.register, { secret, metadata, ipKey });
    console.log(JSON.stringify({ ev: "oauth", step: "register", status: r.ok ? "ok" : r.error }));
    if (!r.ok) return oauthError(r.error, r.description);
    return json(
      {
        client_id: r.clientId,
        client_id_issued_at: r.issuedAt,
        client_name: r.name,
        redirect_uris: r.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  } catch (e) {
    const limited = e instanceof ConvexError && (e.data as { code?: string })?.code === "LIMIT";
    return limited ? oauthError("invalid_request", "Too many registrations. Try again in an hour.", 429) : oauthError("temporarily_unavailable", "Necro is unavailable. Try again shortly.", 503);
  }
}

export const OPTIONS = preflight;
