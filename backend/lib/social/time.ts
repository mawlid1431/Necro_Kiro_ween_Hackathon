// Times for MCP posting: stored in UTC (ms), shown in UTC and in the user's zone (Asia/Singapore, UTC+8, no DST).
// Pure: no Node APIs, so Convex queries, mutations and tests can import it.

export const USER_TIME_ZONE = "Asia/Singapore";
const OFFSET_MS = 8 * 3_600_000;
const OFFSET = "+08:00";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export type Zoned = { utc: string; singapore: string; label: string; timeZone: string };

/** One instant in UTC and in Singapore time, e.g. 2026-11-26T09:00:00+08:00 and "Thu 26 Nov 2026, 09:00 SGT". */
export function zoned(ms: number): Zoned {
  const d = new Date(ms + OFFSET_MS); // read with getUTC* = Singapore wall-clock time
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return {
    utc: new Date(ms).toISOString(),
    singapore: `${date}T${time}:${pad(d.getUTCSeconds())}${OFFSET}`,
    label: `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${time} SGT`,
    timeZone: USER_TIME_ZONE,
  };
}

// An ISO 8601 date-time that says which zone it is in: "Z" or "+08:00" / "+0800".
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?([zZ]|[+-]\d{2}:?\d{2})$/;

/**
 * Parses a schedule time. A time without a zone is refused: "09:00" means a different moment on every server,
 * and the post must go out at the minute the user asked for.
 */
export function parseScheduleAt(iso: string): { ok: true; ms: number } | { ok: false; message: string } {
  const s = iso.trim();
  if (!ISO_WITH_ZONE.test(s)) {
    return { ok: false, message: "Give the time as ISO 8601 with a time zone, e.g. 2026-11-26T09:00:00+08:00 for 9:00 AM Singapore time." };
  }
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return { ok: false, message: "That date does not exist. Check the day and month." };
  return { ok: true, ms };
}
