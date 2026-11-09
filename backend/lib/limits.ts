// Per-user limits (build prompt: "Limits and cost control" and "Security").

export const MAX_GRAVES_PER_USER = 300;
export const SUMMONS_PER_HOUR = 30;
export const MAX_API_KEYS = 5;
export const MCP_CALLS_PER_MINUTE = 60;

export const DAILY_AI_LIMITS = {
  seance: 100,
  resurrect: 50,
  doctor: 30,
  ask: 20,
} as const;

export type LimitedAiTask = keyof typeof DAILY_AI_LIMITS;

export const VOICE_SECONDS_PER_DAY = 30 * 60;

// Covens (shared collections)
export const MAX_COLLECTIONS_PER_USER = 10;
export const MAX_FEEDS_PER_COLLECTION = 50;
export const PUBLISHES_PER_HOUR = 10;
export const REPORTS_TO_HIDE = 3;
