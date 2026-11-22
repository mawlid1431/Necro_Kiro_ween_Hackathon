import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { auth } from "@clerk/nextjs/server";
import { parseLinkCard, type LinkCard } from "@backend/lib/social/og";

// Reads an article's Open Graph / Twitter tags, the same tags X and LinkedIn read to draw a link card
// (and the same parser the LinkedIn poster uses), so the Resurrect preview shows the real card. Signed-in users only.

export type LinkPreview = LinkCard;

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

function privateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Only public http(s) hosts on default ports: never this server's network. */
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.port || u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

async function fetchHtml(start: string): Promise<{ url: URL; html: string } | null> {
  let next = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await safeUrl(next);
    if (!u) return null;
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      // Many sites only serve their cards to known crawlers; this is the name X's own crawler uses.
      headers: { "user-agent": "Twitterbot/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      next = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
    // Read only the start of the page: the tags live in <head>.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const dec = new TextDecoder();
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (dec.decode(value, { stream: true }).includes("</head>")) break;
    }
    void reader.cancel().catch(() => {});
    return { url: u, html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });

  const target = new URL(req.url).searchParams.get("url") ?? "";
  const page = await fetchHtml(target).catch(() => null);
  if (!page) return Response.json({ error: "No preview for this link." }, { status: 404 });
  return Response.json(parseLinkCard(page.html, page.url.toString()), { headers: { "cache-control": "private, max-age=3600" } });
}
