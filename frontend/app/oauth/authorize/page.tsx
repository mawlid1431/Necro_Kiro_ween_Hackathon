import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { Metadata } from "next";
import { api } from "@backend/convex/_generated/api";
import { AuthShell } from "@/components/layout/AuthShell";
import { Consent, ConsentError } from "@/components/oauth/Consent";
import { convexServer, serverSecret } from "@/lib/server/convex";
import { matchResource, originFromHeaders } from "@/lib/server/mcpOAuth";
import { requestedScope } from "@backend/lib/mcpOAuth";

// OAuth 2.1 authorization endpoint for the MCP server: ChatGPT or Claude sends the user here, Necro checks the app
// (client id + redirect URI) on the server, and the signed-in user approves read or read-and-write access.
// Errors about the app itself are shown here; errors about the request go back to the (verified) app, per RFC 6749 4.1.2.1.

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } };

export default function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-[420px]" />}>
        <Authorize searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? undefined : v; // a repeated parameter is an error (RFC 6749 3.1)
}

async function Authorize({ searchParams }: Pick<PageProps<"/oauth/authorize">, "searchParams">) {
  await connection(); // always per request: never prerender a consent decision (and the Convex client uses Math.random)
  const sp = await searchParams;
  const origin = originFromHeaders(await headers());
  const clientId = one(sp.client_id) ?? "";
  const redirectUri = one(sp.redirect_uri) ?? "";
  const state = one(sp.state)?.slice(0, 1000); // opaque to Necro; capped so a link cannot carry a huge payload

  let secret: string;
  try {
    secret = serverSecret("MCP_SERVER_SECRET");
  } catch {
    return <ConsentError message="Necro's MCP server is not configured." />;
  }
  let described;
  try {
    described = await convexServer().action(api.mcpOAuthNode.describeClient, { secret, clientId, redirectUri });
  } catch {
    return <ConsentError message="Necro is unavailable. Try again shortly." />;
  }
  if (!described.ok) return <ConsentError message={described.message} />;

  // From here the redirect URI is verified, so request errors go back to the app.
  const back = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (state) u.searchParams.set("state", state);
    u.searchParams.set("iss", origin);
    return u.toString();
  };
  const resource = matchResource(one(sp.resource), origin);
  let problem: string | null = null;
  if (one(sp.response_type) !== "code") problem = back("unsupported_response_type", "Use response_type=code.");
  else if (one(sp.code_challenge_method) !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(one(sp.code_challenge) ?? "")) problem = back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  else if (!resource) problem = back("invalid_target", "This server only issues tokens for its own MCP endpoint.");
  if (problem) return <ConsentError message="This app sent an incomplete request." returnTo={problem} />;

  return (
    <Consent
      app={described.name}
      clientHost={described.clientHost}
      redirectHost={described.redirectHost}
      verified={described.kind === "cimd"}
      clientId={clientId}
      redirectUri={redirectUri}
      state={state ?? null}
      codeChallenge={one(sp.code_challenge)!}
      resource={resource!}
      issuer={origin}
      requested={requestedScope(one(sp.scope))}
    />
  );
}
