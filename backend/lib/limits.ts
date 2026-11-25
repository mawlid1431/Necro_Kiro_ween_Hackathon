// Per-user limits (build prompt: "Limits and cost control" and "Security").

export const MAX_GRAVES_PER_USER = 300;
export const SUMMONS_PER_HOUR = 30;
export const MAX_API_KEYS = 5;
export const MCP_CALLS_PER_MINUTE = 60;

/** A positive whole number from an environment variable, or the default. Read at call time so a change applies at once. */
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * MCP write limits per key (API key or OAuth grant), on top of the app's own per-user caps.
 * Override with Convex env vars MCP_POSTS_PER_DAY and MCP_WRITE_CALLS_PER_HOUR.
 * A post to two platforms counts as two posts (one per account it goes to).
 */
export const mcpWriteLimits = () => ({
  postsPerDay: envInt("MCP_POSTS_PER_DAY", 20),
  writeCallsPerHour: envInt("MCP_WRITE_CALLS_PER_HOUR", 60),
});

export const DAILY_AI_LIMITS = {
  seance: 100,
  resurrect: 50,
  doctor: 30,
  ask: 20,
  omen: 200, // AI confirmations of Omen matches; beyond this, keyword matches only
  opinion: 30, // Second Opinions (compare sources)
  grimoire: 10, // weekly newsletter drafts composed (AI or template)
  caption: 30, // AI captions for your own images (Witching Hour composer)
} as const;

export type LimitedAiTask = keyof typeof DAILY_AI_LIMITS;

export const VOICE_SECONDS_PER_DAY = 30 * 60;

// Covens (shared collections)
export const MAX_COLLECTIONS_PER_USER = 10;
export const MAX_FEEDS_PER_COLLECTION = 50;
export const PUBLISHES_PER_HOUR = 10;
export const REPORTS_TO_HIDE = 3;

// Omens (topic alerts)
export const MAX_OMENS_PER_USER = 20;
export const OMEN_CHECKS_PER_RUN = 30;
