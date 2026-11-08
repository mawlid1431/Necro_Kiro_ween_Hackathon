import "server-only";
import { ConvexHttpClient } from "convex/browser";

/** Server-side Convex client for the API routes (MCP, LiveKit). One per request: it holds no auth. */
export function convexServer(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

/** A server secret shared with Convex. Never exposed to the browser (no NEXT_PUBLIC_ prefix). */
export function serverSecret(name: "MCP_SERVER_SECRET" | "AGENT_SERVER_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} is not set (32+ characters)`);
  return value;
}
