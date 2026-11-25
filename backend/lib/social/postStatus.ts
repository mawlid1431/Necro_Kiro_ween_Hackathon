// A post (one create_post call) is one publishes row per platform. Its overall status is derived from the rows.
// Pure, so it is unit-tested directly.

import type { PublishStatus } from "./dedupe";

export type OverallStatus = PublishStatus | "partly_posted";

/**
 * - anything still sending → "posting"; anything still waiting → "scheduled", then "due" (a reminder whose time came);
 * - some posted and some failed → "partly_posted"; otherwise failed, posted, then canceled.
 * Cancelled rows are ignored while any other row exists.
 */
export function overallStatus(statuses: PublishStatus[]): OverallStatus {
  const live = statuses.filter((s) => s !== "canceled");
  if (!live.length) return "canceled";
  for (const s of ["posting", "scheduled", "due"] as const) if (live.includes(s)) return s;
  const posted = live.includes("posted");
  const failed = live.includes("failed");
  if (posted && failed) return "partly_posted";
  return failed ? "failed" : "posted";
}

/**
 * update_post: allowed only while every row that is not cancelled is still scheduled.
 * cancel_post: also a reminder that is due but not shared yet (as cancel_post always allowed); nothing that went out.
 */
export function editableError(statuses: PublishStatus[], action: "edit" | "cancel"): string | null {
  const live = statuses.filter((s) => s !== "canceled");
  if (!live.length) return "This post was already cancelled.";
  const ok = action === "edit" ? ["scheduled"] : ["scheduled", "due"];
  const blocking = live.find((s) => !ok.includes(s));
  if (!blocking) return null;
  const what = blocking === "due" ? "a reminder that is already due" : blocking === "posting" ? "being posted right now" : `already ${blocking}`;
  return `This post is ${what}, so it can't be ${action === "edit" ? "edited" : "cancelled"}. Only scheduled posts can.`;
}
