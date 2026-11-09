import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export type FetchErrorCode =
  | "BAD_URL" | "BLOCKED" | "DNS" | "TIMEOUT" | "TOO_LARGE" | "TOO_MANY_REDIRECTS" | "NETWORK" | `HTTP_${number}`;

export class SafeFetchError extends Error {
  constructor(public code: FetchErrorCode, message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetchResult {
  url: string; // final URL after redirects
  status: number;
  notModified: boolean;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  body: string; // decoded text ("" when notModified)
  permanentRedirect: boolean; // true when every redirect hop was 301 or 308
}

export interface SafeFetchOptions {
  etag?: string;
  lastModified?: string;
  maxBytes?: number; // default 5 MB
  timeoutMs?: number; // default 10 s
  maxRedirects?: number; // default 5
}

// ---------- IP rules ----------

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

function expandV6(ip: string): number[] {
  // Returns 8 hextets. Handles "::" and an embedded IPv4 tail.
  let s = ip.toLowerCase().split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = tail !== undefined ? Array(8 - h.length - t.length).fill("0") : [];
  return [...h, ...fill, ...t].map((x) => parseInt(x || "0", 16));
}

function isBlockedV6(ip: string): boolean {
  const x = expandV6(ip);
  const embeddedV4 = () => `${x[6] >> 8}.${x[6] & 255}.${x[7] >> 8}.${x[7] & 255}`;
  if (x.every((p) => p === 0)) return true; // ::
  if (x.slice(0, 7).every((p) => p === 0) && x[7] === 1) return true; // ::1
  if (x.slice(0, 5).every((p) => p === 0) && x[5] === 0xffff) return isBlockedV4(embeddedV4()); // ::ffff:a.b.c.d
  if (x[0] === 0x64 && x[1] === 0xff9b) return isBlockedV4(embeddedV4()); // NAT64
  if ((x[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((x[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((x[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (x[0] === 0x2001 && x[1] === 0x0db8) return true; // documentation
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true; // not an IP at all: refuse
}

// ---------- URL rules ----------

export function checkUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SafeFetchError("BAD_URL", "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("BAD_URL", "Only http and https URLs are allowed.");
  }
  if (url.username || url.password) throw new SafeFetchError("BAD_URL", "URLs with credentials are not allowed.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port < 1024 && port !== 80 && port !== 443) throw new SafeFetchError("BLOCKED", "That port is not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SafeFetchError("BLOCKED", "Local addresses are not allowed.");
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new SafeFetchError("BLOCKED", "Private addresses are not allowed.");
  return url;
}

// The check runs inside the socket connect step, on the exact IPs used,
// so a DNS answer that changes between check and connect (rebinding) cannot slip through.
const safeLookup: typeof dns.lookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) {
      const e = new Error(`Blocked address for ${hostname}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as typeof dns.lookup;

const agent = new Agent({
  connect: { lookup: safeLookup, timeout: 5_000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.7, */*;q=0.5";

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { maxBytes = 5 * 1024 * 1024, timeoutMs = 10_000, maxRedirects = 5 } = opts;
  let url = checkUrl(input);
  let permanent = true;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const headers: Record<string, string> = {
      "user-agent": `Necro/1.0 (+${process.env.NECRO_BOT_CONTACT_URL ?? "https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon"})`,
      accept: ACCEPT,
    };
    if (hop === 0 && opts.etag) headers["if-none-match"] = opts.etag;
    if (hop === 0 && opts.lastModified) headers["if-modified-since"] = opts.lastModified;

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, {
        headers,
        redirect: "manual",
        dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw mapNetworkError(e);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new SafeFetchError("NETWORK", "Redirect without a Location header.");
      if (res.status !== 301 && res.status !== 308) permanent = false;
      url = checkUrl(new URL(location, url).toString()); // every hop is re-checked
      continue;
    }

    const base = {
      url: url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      permanentRedirect: hop > 0 && permanent,
    };

    if (res.status === 304) {
      await res.body?.cancel();
      return { ...base, notModified: true, body: "" };
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel();
      throw new SafeFetchError(`HTTP_${res.status}`, `The server answered ${res.status}.`);
    }

    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new SafeFetchError("TOO_LARGE", "The feed is larger than 5 MB.");
    }

    const bytes = await readCapped(res.body, maxBytes);
    return { ...base, notModified: false, body: decodeBody(bytes, base.contentType) };
  }

  throw new SafeFetchError("TOO_MANY_REDIRECTS", `More than ${maxRedirects} redirects.`);
}

type ByteStream = { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } };

async function readCapped(body: ByteStream | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError("TOO_LARGE", "The feed is larger than 5 MB.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Charset: HTTP header first, then the XML prolog or HTML meta, then UTF-8.
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const charset =
    contentType.match(/charset="?([\w-]+)/i)?.[1] ??
    head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  }
}

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME", "ENODATA", "ESERVFAIL", "EBUSY"]);

export function mapNetworkError(e: unknown): SafeFetchError {
  const err = e as { name?: string; code?: string; cause?: { code?: string; message?: string }; message?: string };
  const code = err.cause?.code ?? err.code;
  const message = err.cause?.message ?? err.message ?? "";
  if (err.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return new SafeFetchError("TIMEOUT", "The site took too long to answer.");
  }
  if (code === "EBLOCKED") return new SafeFetchError("BLOCKED", "That address is private or reserved.");
  // Any failed name lookup is a DNS problem. Convex's runtime reports a missing domain as
  // "getaddrinfo EBUSY <host>" rather than ENOTFOUND, so match the lookup, not one code.
  if ((code && DNS_CODES.has(code)) || /^getaddrinfo\b/.test(message)) {
    return new SafeFetchError("DNS", "The domain could not be found.");
  }
  return new SafeFetchError("NETWORK", message || "Network error.");
}
