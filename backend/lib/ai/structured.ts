import { APICallError } from "ai";

/**
 * Groq checks structured output against the JSON schema on its side. When the model's JSON breaks it
 * (a summary line over its max length, a missing field…), Groq answers HTTP 400 `json_validate_failed`
 * instead of returning the text. That is a schema miss by the model, not an unhealthy provider, so the
 * ladder should repair it on the same rung like any other bad JSON.
 *
 * Returns the model's rejected answer (Groq's `failed_generation`, possibly ""), or null when `e` is
 * not this kind of error.
 */
export function schemaRejectedByProvider(e: unknown): string | null {
  if (!APICallError.isInstance(e) || e.statusCode !== 400) return null;
  const body = e.responseBody ?? "";
  if (!body.includes("json_validate_failed")) return null;
  try {
    const parsed = JSON.parse(body) as { error?: { failed_generation?: unknown } };
    const failed = parsed.error?.failed_generation;
    return typeof failed === "string" ? failed : "";
  } catch {
    return "";
  }
}
