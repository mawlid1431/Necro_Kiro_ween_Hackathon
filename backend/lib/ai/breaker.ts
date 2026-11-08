// Circuit breaker rules (Final Draft 8.2). Pure, so it is unit tested; convex/providerHealth.ts stores the state.

export type BreakerState = "closed" | "open" | "half_open";

export interface Breaker {
  state: BreakerState;
  failures: number;
  windowStart: number;
  openedUntil: number;
  cooldownMs: number;
  lastStatus?: number;
}

const WINDOW_MS = 2 * 60_000;
const FAILURES_TO_OPEN = 5;
const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 30 * 60_000;
const BAD_KEY_COOLDOWN_MS = 60 * 60_000;

export function freshBreaker(now: number): Breaker {
  return { state: "closed", failures: 0, windowStart: now, openedUntil: 0, cooldownMs: BASE_COOLDOWN_MS };
}

/** Open = skip without calling. After openedUntil the breaker is half-open and lets a request through. */
export function isOpen(b: Breaker | null, now: number): boolean {
  return !!b && b.state === "open" && now < b.openedUntil;
}

export function onSuccess(now: number): Breaker {
  return freshBreaker(now);
}

export function onFailure(prev: Breaker | null, now: number, status?: number, retryAfterMs?: number): Breaker {
  const b = prev ?? freshBreaker(now);
  const probing = b.state === "open" && now >= b.openedUntil; // half-open probe failed

  if (status === 401 || status === 403) {
    // A bad key will not fix itself: open for an hour (and the caller logs loudly).
    return { ...b, state: "open", failures: b.failures + 1, openedUntil: now + BAD_KEY_COOLDOWN_MS, lastStatus: status };
  }
  if (status === 429) {
    const wait = Math.max(retryAfterMs ?? 0, BASE_COOLDOWN_MS);
    return { ...b, state: "open", failures: b.failures + 1, openedUntil: now + wait, lastStatus: status };
  }
  if (probing) {
    const cooldownMs = Math.min(b.cooldownMs * 2, MAX_COOLDOWN_MS);
    return { ...b, state: "open", failures: b.failures + 1, cooldownMs, openedUntil: now + cooldownMs, lastStatus: status };
  }

  const inWindow = now - b.windowStart <= WINDOW_MS;
  const failures = inWindow ? b.failures + 1 : 1;
  const windowStart = inWindow ? b.windowStart : now;
  if (failures >= FAILURES_TO_OPEN) {
    return { ...b, state: "open", failures, windowStart, openedUntil: now + b.cooldownMs, lastStatus: status };
  }
  return { ...b, state: "closed", failures, windowStart, lastStatus: status };
}
