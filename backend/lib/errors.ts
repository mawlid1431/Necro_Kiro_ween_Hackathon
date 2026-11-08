// The error contract (build prompt: "Backend API surface" > Error contract) and the
// plain-language Feed Doctor diagnoses. No Node APIs here, so queries can import it.

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "LIMIT"
  | "DUPLICATE"
  | "NOT_A_FEED"
  | "BLOCKED"
  | "INVALID_INPUT"
  | "AI_UNAVAILABLE"
  | "FORBIDDEN";

const DIAGNOSES: Record<string, string> = {
  DNS: "This site's domain could not be found. It may have moved or shut down.",
  HTTP_404: "The feed address no longer exists. Try fix to look for its new address.",
  HTTP_410: "The feed address no longer exists. Try fix to look for its new address.",
  HTTP_401: "The site refuses feed readers or needs a login.",
  HTTP_403: "The site refuses feed readers or needs a login.",
  HTTP_429: "The site asked us to slow down. Necro will try again later.",
  TIMEOUT: "The site took too long to answer.",
  TOO_LARGE: "The feed is over 5 MB, which is too big to read.",
  BLOCKED: "That address points to a private network, so Necro will not fetch it.",
  NOT_A_FEED: "This address now returns a web page instead of a feed. Try fix to find the feed.",
  NOT_XML: "This address now returns a web page instead of a feed. Try fix to find the feed.",
  PARSE: "The feed is broken XML. Necro will retry, but the site needs to fix it.",
  BAD_URL: "That is not a valid feed address.",
  TOO_MANY_REDIRECTS: "The feed keeps redirecting and never arrives.",
  NETWORK: "Necro could not reach the site. It will keep trying.",
};

/** Plain-language sentence for a grave's lastErrorCode. */
export function diagnose(code: string | undefined): string {
  if (!code) return "This feed has not published anything for a long time.";
  if (DIAGNOSES[code]) return DIAGNOSES[code];
  if (/^HTTP_5\d\d$/.test(code)) return "The site's server is having trouble. Necro will keep trying.";
  if (/^HTTP_\d+$/.test(code)) return `The site answered with an error (${code.slice(5)}).`;
  return "Something went wrong reading this feed. Necro will keep trying.";
}

/** Maps a feed/fetch error code onto the client error contract. */
export function clientCodeFor(code: string): ErrorCode {
  if (code === "BLOCKED") return "BLOCKED";
  if (code === "BAD_URL") return "INVALID_INPUT";
  return "NOT_A_FEED";
}
