// OAuth 2.1 helpers for the MCP server: PKCE, scopes, redirect URIs, client ids and client metadata.
import { describe, expect, it } from "vitest";
import {
  TOKEN_RE,
  cleanClientMetadata,
  isCimdClientId,
  randomToken,
  redirectAllowed,
  requestedScope,
  s256,
  scopeString,
  validRedirectUri,
  verifyPkce,
} from "../../lib/mcpOAuth";

describe("PKCE (S256)", () => {
  it("is base64url(SHA-256(verifier)) without padding, like Node's crypto", async () => {
    const { createHash } = await import("node:crypto");
    for (const verifier of ["a".repeat(43), "Zz09-._~".repeat(8), "x".repeat(128)]) {
      expect(await s256(verifier)).toBe(createHash("sha256").update(verifier).digest("base64url"));
    }
  });

  it("accepts the right verifier and refuses a wrong, short or malformed one", async () => {
    const verifier = "a".repeat(43) + "-._~" + "Z".repeat(10);
    const challenge = await s256(verifier);
    expect(await verifyPkce(verifier, challenge)).toBe(true);
    expect(await verifyPkce(verifier + "x", challenge)).toBe(false);
    expect(await verifyPkce("short", await s256("short"))).toBe(false); // under 43 chars
    expect(await verifyPkce("a".repeat(129), await s256("a".repeat(129)))).toBe(false); // over 128
    expect(await verifyPkce("a".repeat(42) + "!", await s256("a".repeat(42) + "!"))).toBe(false); // bad charset
    expect(await verifyPkce(verifier, "not-a-challenge")).toBe(false);
  });
});

describe("scopes", () => {
  it("write only when asked for; write includes read", () => {
    expect(requestedScope(undefined)).toBe("read");
    expect(requestedScope("read")).toBe("read");
    expect(requestedScope("read write")).toBe("write");
    expect(requestedScope("openid write")).toBe("write");
    expect(requestedScope("writer")).toBe("read");
    expect(scopeString("write")).toBe("read write");
    expect(scopeString("read")).toBe("read");
  });
});

describe("redirect URIs", () => {
  it("allows https and loopback http only", () => {
    expect(validRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(validRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(validRedirectUri("http://evil.example/cb")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
    expect(validRedirectUri("https://a.example/cb#frag")).toBe(false);
    expect(validRedirectUri("https://user:pw@a.example/cb")).toBe(false);
    expect(validRedirectUri("myapp://cb")).toBe(false);
  });

  it("matches exactly, except loopback ports", () => {
    const reg = ["https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:6274/oauth/callback"];
    expect(redirectAllowed(reg, "https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(redirectAllowed(reg, "https://chatgpt.com/connector_platform_oauth_redirect/")).toBe(false);
    expect(redirectAllowed(reg, "https://chatgpt.com/connector_platform_oauth_redirect?x=1")).toBe(false);
    expect(redirectAllowed(reg, "http://localhost:9999/oauth/callback")).toBe(true);
    expect(redirectAllowed(reg, "http://localhost:9999/other")).toBe(false);
    expect(redirectAllowed(reg, "https://localhost:6274/oauth/callback")).toBe(false);
  });
});

describe("clients", () => {
  it("recognises Client ID Metadata Document URLs", () => {
    expect(isCimdClientId("https://chatgpt.com/oauth/client.json")).toBe(true);
    expect(isCimdClientId("https://chatgpt.com/")).toBe(false);
    expect(isCimdClientId("http://chatgpt.com/oauth/client.json")).toBe(false);
    expect(isCimdClientId("https://chatgpt.com/oauth/client.json?x=1")).toBe(false);
    expect(isCimdClientId("necro_cl_abc")).toBe(false);
  });

  it("cleans client metadata and refuses unsafe documents", () => {
    const id = "https://chatgpt.com/oauth/client.json";
    expect(
      cleanClientMetadata(
        { client_id: id, client_name: "ChatGPT\u0007", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_methods_supported: ["none", "private_key_jwt"], token_endpoint_auth_method: "private_key_jwt" },
        id,
      ),
    ).toEqual({ name: "ChatGPT", redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"] });
    expect(cleanClientMetadata({ client_id: "https://other.example/c.json", redirect_uris: ["https://a.example/cb"] }, id)).toHaveProperty("error");
    expect(cleanClientMetadata({ redirect_uris: [] })).toHaveProperty("error");
    expect(cleanClientMetadata({ redirect_uris: ["http://evil.example/cb"] })).toHaveProperty("error");
    expect(cleanClientMetadata({ redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_basic" })).toHaveProperty("error");
    expect(cleanClientMetadata({ redirect_uris: ["https://a.example/cb"] })).toEqual({ name: "a.example", redirectUris: ["https://a.example/cb"] });
    expect(cleanClientMetadata("nope")).toHaveProperty("error");
  });
});

describe("tokens", () => {
  it("are 256-bit, well formed and unique", () => {
    const a = randomToken("necro_at_");
    expect(a).toMatch(TOKEN_RE.access);
    expect(randomToken("necro_rt_")).toMatch(TOKEN_RE.refresh);
    expect(randomToken("necro_ac_")).toMatch(TOKEN_RE.code);
    expect(new Set(Array.from({ length: 200 }, () => randomToken("necro_at_"))).size).toBe(200);
  });
});
