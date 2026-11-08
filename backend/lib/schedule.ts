// Polling schedule for graves (build prompt: "Scheduling rules"). Pure, so it is unit tested.

export type GraveStatus = "alive" | "dormant" | "broken";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ±10% jitter so feeds do not all fire together. `rand` is injectable for tests. */
export function jitter(ms: number, rand: () => number = Math.random): number {
  return Math.round(ms * (0.9 + rand() * 0.2));
}

/** After a successful fetch: interval depends on how recently the feed published. */
export function afterSuccess(
  now: number,
  lastNewItemAt: number | undefined,
  rand?: () => number,
): { nextFetchAt: number; status: GraveStatus } {
  const age = lastNewItemAt === undefined ? Infinity : now - lastNewItemAt;
  let interval: number;
  let status: GraveStatus = "alive";
  if (age <= DAY) interval = 15 * MIN;
  else if (age <= 7 * DAY) interval = HOUR;
  else if (age <= 30 * DAY) interval = 6 * HOUR;
  else {
    interval = DAY;
    status = "dormant";
  }
  return { nextFetchAt: now + jitter(interval, rand), status };
}

/** After a failed fetch. `failureCount` is the count including this failure. */
export function afterFailure(
  now: number,
  failureCount: number,
  code: string,
  currentStatus: GraveStatus,
  rand?: () => number,
): { nextFetchAt: number; status: GraveStatus } {
  let interval: number;
  let status = currentStatus;
  if (failureCount <= 1) interval = 15 * MIN;
  else if (failureCount === 2) interval = HOUR;
  else {
    interval = failureCount >= 5 ? DAY : 6 * HOUR;
    status = "broken";
  }
  if (code === "HTTP_429" || code === "HTTP_503") interval = Math.max(interval, HOUR);
  return { nextFetchAt: now + jitter(interval, rand), status };
}
