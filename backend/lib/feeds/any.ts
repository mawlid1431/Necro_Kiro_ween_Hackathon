import { looksLikeFeed } from "./discover";
import { looksLikeJsonFeed, parseJsonFeed } from "./jsonfeed";
import { parseFeed, type ParsedFeed } from "./parse";

/** True for RSS, RDF, Atom or JSON Feed bodies, whatever the Content-Type says. */
export function isFeedBody(body: string): boolean {
  return looksLikeJsonFeed(body) || looksLikeFeed(body);
}

/** Parses any supported format. JSON Feed is checked first. */
export function parseAnyFeed(body: string, ctx: { feedUrl: string; fetchedAt: number }): ParsedFeed {
  return looksLikeJsonFeed(body) ? parseJsonFeed(body, ctx) : parseFeed(body, ctx);
}
