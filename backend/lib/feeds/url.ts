// Pure URL helpers shared by actions and mutations (no Node APIs, so mutations can import them).

/** Lowercase host, drop the #fragment and a trailing slash on the path. Used for dedupe. */
export function normaliseFeedUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return input.trim();
  }
}

/** Add https:// when the user typed a bare domain. */
export function withScheme(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** https://<host>/favicon.ico. Never fetched server-side. */
export function faviconFor(url: string): string | undefined {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}
