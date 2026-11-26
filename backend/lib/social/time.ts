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

/** A valid IANA zone, or Singapore (the default) when missing or unknown. */
export function safeZone(tz: string | undefined | null): string {
  if (!tz) return USER_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return USER_TIME_ZONE;
  }
}

/** The calendar day ("YYYY-MM-DD") of `ms` in `timeZone`. */
export function localDay(ms: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The last `n` local days ending today, oldest first. */
export function lastDays(n: number, now: number, timeZone: string): string[] {
  const out: string[] = [];
  // Step back by 24 h from local noon-ish: a day is never skipped or doubled, even across DST changes.
  for (let i = n - 1 + 2; i >= 0 && out.length < n + 2; i--) {
    const d = localDay(now - i * 86_400_000, timeZone);
    if (out.at(-1) !== d) out.push(d);
  }
  return out.slice(-n);
}

/** One instant in UTC, Singapore AND the user's own zone ("local"). */
export function zonedFor(ms: number, timeZone: string): Zoned & { local: string; localTimeZone: string } {
  const z = zoned(ms);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(ms));
  return { ...z, local: p, localTimeZone: timeZone };
}
