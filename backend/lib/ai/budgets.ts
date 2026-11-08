// Provider budgets: 80% of each provider's published free limits (Final Draft 8.3),
// so the router skips a rung before the provider ever answers 429.
// Free-tier numbers change often: re-check the provider dashboards before the demo.

export interface Budget {
  perMinute: number;
  perDay: number;
}

export const PROVIDER_BUDGETS: Record<string, Budget> = {
  groq: { perMinute: 24, perDay: 800 }, // 70B-class free tier: ~30 RPM / 1,000 RPD per organisation
  google: { perMinute: 12, perDay: 800 }, // Gemini Flash free tier
  "openrouter-free": { perMinute: 16, perDay: 800 }, // 20 RPM; 1,000 RPD after a one-time $10 top-up (50 before)
  openrouter: { perMinute: 60, perDay: 5_000 }, // paid models: no platform cap, this is a spend guard
  mock: { perMinute: 10_000, perDay: 100_000 },
};

/** Override with AI_BUDGET_<PROVIDER>="rpm,rpd", e.g. AI_BUDGET_OPENROUTER_FREE="16,40" before the top-up. */
export function budgetFor(provider: string, env: Record<string, string | undefined> = process.env): Budget {
  const override = env[`AI_BUDGET_${provider.toUpperCase().replace(/-/g, "_")}`];
  const m = override?.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (m) return { perMinute: Number(m[1]), perDay: Number(m[2]) };
  return PROVIDER_BUDGETS[provider] ?? { perMinute: 20, perDay: 500 };
}
