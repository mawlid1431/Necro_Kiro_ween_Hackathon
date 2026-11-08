import { ConvexError } from "convex/values";

/** The backend error contract: ConvexError({ code, message }) with a message safe to show. */
export function errorCode(e: unknown): string | undefined {
  return e instanceof ConvexError ? (e.data as { code?: string })?.code : undefined;
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e instanceof ConvexError) {
    const d = e.data as { message?: string } | string;
    if (typeof d === "string") return d;
    if (d?.message) return d.message;
  }
  return fallback;
}
