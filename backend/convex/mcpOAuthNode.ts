"use node";
// Resolves the app asking for access before the consent page is shown: a registered (DCR) client from the database,
// or a Client ID Metadata Document fetched from the client id URL (ChatGPT's https://chatgpt.com/oauth/client.json).
// The fetch uses safeFetch (SSRF rules, size and time limits, no redirects); the result is cached for a day.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertSecret } from "./lib/auth";
import { safeFetch } from "../lib/security/ssrf";
import { CIMD_TTL_MS, cleanClientMetadata, hostOf, isCimdClientId, redirectAllowed } from "../lib/mcpOAuth";

type Described =
  | { ok: true; name: string; kind: "dcr" | "cimd"; clientHost: string | null; redirectHost: string }
  | { ok: false; canRedirect: false; message: string };

export const describeClient = action({
  args: { secret: v.string(), clientId: v.string(), redirectUri: v.string() },
  handler: async (ctx, { secret, clientId, redirectUri }): Promise<Described> => {
    assertSecret(secret, "MCP_SERVER_SECRET");
    const nope = (message: string): Described => ({ ok: false, canRedirect: false, message });
    if (!clientId || clientId.length > 500) return nope("This sign-in link has no valid app id.");

    let client = await ctx.runQuery(internal.mcpOAuth.getClient, { clientId });
    if (isCimdClientId(clientId) && (!client || !client.fetchedAt || Date.now() - client.fetchedAt > CIMD_TTL_MS)) {
      if (!(await ctx.runMutation(internal.mcpOAuth.allowCimdFetch, { host: hostOf(clientId) }))) {
        if (!client) return nope("Too many sign-in attempts for this app right now. Try again in a few minutes.");
      } else try {
        const res = await safeFetch(clientId, { maxBytes: 32_768, timeoutMs: 5_000, maxRedirects: 0, accept: "application/json", userAgent: "Necro-OAuth/1.0" });
        const clean = cleanClientMetadata(JSON.parse(res.body), clientId);
        if ("error" in clean) return nope(`This app's details are not valid: ${clean.error}`);
        await ctx.runMutation(internal.mcpOAuth.saveCimdClient, { clientId, name: clean.name, redirectUris: clean.redirectUris });
        client = await ctx.runQuery(internal.mcpOAuth.getClient, { clientId });
      } catch {
        // A stale copy is better than failing when the app's site has a blip.
        if (!client) return nope("Necro could not read this app's details. Try again in a moment.");
      }
    }
    if (!client) return nope("Necro does not know this app. Remove the connector and add it again.");
    if (!redirectAllowed(client.redirectUris, redirectUri)) return nope("This app asked to send you somewhere it did not register. Necro stopped here to keep your account safe.");
    return { ok: true, name: client.name, kind: client.kind, clientHost: client.kind === "cimd" ? hostOf(clientId) : null, redirectHost: hostOf(redirectUri) };
  },
});
