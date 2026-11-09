// Omens: cheap keyword pre-filter before any AI confirmation (spec .kiro/specs/omens).
import { STOP, words } from "./ghost";

/** Meaningful words of a topic: lower-case, no stop words, deduplicated, at most 6. */
export function omenKeywords(topic: string): string[] {
  const out: string[] = [];
  for (const w of words(topic)) if (!STOP.has(w) && w.length > 1 && !out.includes(w)) out.push(w);
  return out.slice(0, 6);
}

function stem(w: string): string {
  return w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
}

/** A candidate contains every keyword (simple plurals count). Single-word topics need just that word. */
export function isOmenCandidate(keywords: string[], text: string): boolean {
  if (!keywords.length) return false;
  const have = new Set(words(text).map(stem));
  return keywords.every((k) => have.has(stem(k)));
}

/** Label for a match kept without AI. */
export function keywordReason(keywords: string[]): string {
  return `Mentions ${keywords.join(", ")}`.slice(0, 160);
}
