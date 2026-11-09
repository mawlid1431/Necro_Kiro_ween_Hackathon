// The AI router: walks a task's chain of rungs, skipping providers whose circuit
// breaker is open or whose free-tier budget is spent, and never sending private
// data to providers that may train on prompts. When every rung fails it throws
// AllRungsFailed and the caller answers with Ghost mode, so users never see an AI error.
import type { Rung } from "./providers";

export type AiTask = "seance" | "resurrect" | "doctor" | "briefing" | "ask" | "omen" | "opinion" | "grimoire";
export type Privacy = "public" | "private";

export const TASK_PRIVACY: Record<AiTask, Privacy> = {
  seance: "public",
  doctor: "public",
  briefing: "public",
  resurrect: "private", // voice samples
  ask: "private", // the user's question
  omen: "private", // the user's watched topics
  opinion: "public", // article text only
  grimoire: "private", // voice samples and reading history
};

/** A new task with no chain of its own borrows one with the same privacy, so it works without new env vars. */
const CHAIN_FALLBACK: Partial<Record<AiTask, AiTask>> = { omen: "ask", opinion: "seance", grimoire: "resurrect" };

/** Per-rung timeout so the whole ladder stays under ~30 s. */
export const RUNG_TIMEOUT_MS = 12_000;

/**
 * AI_CHAIN_SEANCE="groq:<id>,google:<id>,openrouter:openrouter/free".
 * Falls back to the older AI_<TASK>_MODEL + AI_FALLBACK_MODEL variables so existing envs keep working.
 */
export function chainFor(task: AiTask, env: Record<string, string | undefined> = process.env): string[] {
  const own = env[`AI_CHAIN_${task.toUpperCase()}`] ?? env[`AI_${task.toUpperCase()}_MODEL`];
  const borrowed = CHAIN_FALLBACK[task];
  if (!own && borrowed) return chainFor(borrowed, env);
  const raw = env[`AI_CHAIN_${task.toUpperCase()}`] ?? [env[`AI_${task.toUpperCase()}_MODEL`], env.AI_FALLBACK_MODEL].filter(Boolean).join(",");
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export interface RouterDeps {
  resolve(spec: string): Rung; // throws when misconfigured (e.g. missing key): that rung is skipped
  isOpen(provider: string): Promise<boolean>; // circuit breaker state
  reserveBudget(provider: string): Promise<boolean>; // false = over the provider's RPM/RPD budget
  recordResult(provider: string, ok: boolean, status?: number, retryAfterMs?: number): Promise<void>;
  log?(line: Record<string, unknown>): void;
}

export class AllRungsFailed extends Error {
  constructor(public task: AiTask, public attempts: { spec: string; outcome: string }[]) {
    super(`All AI rungs failed for ${task}`);
    this.name = "AllRungsFailed";
  }
}

/** Status code and retry-after from AI SDK errors (APICallError and RetryError wrap them). */
export function errorInfo(e: unknown): { status?: number; retryAfterMs?: number } {
  const err = e as { statusCode?: number; responseHeaders?: Record<string, string>; lastError?: unknown; cause?: unknown };
  const inner = err?.statusCode !== undefined ? err : (err?.lastError ?? err?.cause) as typeof err | undefined;
  const status = inner?.statusCode;
  const ra = inner?.responseHeaders?.["retry-after"];
  const retryAfterMs = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : undefined;
  return { status, retryAfterMs };
}

export async function runWithLadder<T>(
  task: AiTask,
  deps: RouterDeps,
  call: (rung: Rung) => Promise<T>,
  validate: (out: T) => boolean = () => true,
  repair?: (rung: Rung, bad: T) => Promise<T>,
  chain: string[] = chainFor(task),
): Promise<{ out: T; spec: string; rung: number; ms: number }> {
  const privacy = TASK_PRIVACY[task];
  const attempts: { spec: string; outcome: string }[] = [];
  const started = Date.now();

  for (const [i, spec] of chain.entries()) {
    let rung: Rung;
    try {
      rung = deps.resolve(spec);
    } catch {
      attempts.push({ spec, outcome: "unconfigured" });
      continue;
    }
    if (privacy === "private" && rung.trainsOnPrompts) {
      attempts.push({ spec, outcome: "privacy" }); // enforced in code, not just documented
      continue;
    }
    if (await deps.isOpen(rung.provider)) {
      attempts.push({ spec, outcome: "breaker_open" });
      continue;
    }
    if (!(await deps.reserveBudget(rung.provider))) {
      attempts.push({ spec, outcome: "budget" });
      continue;
    }
    const t0 = Date.now();
    try {
      let out = await call(rung);
      if (!validate(out) && repair) out = await repair(rung, out);
      if (!validate(out)) throw new Error("schema");
      await deps.recordResult(rung.provider, true);
      const ms = Date.now() - started;
      deps.log?.({ ev: "ai", task, model: spec, rung: i + 1, ms, rungMs: Date.now() - t0, status: "ok" });
      return { out, spec, rung: i + 1, ms };
    } catch (e) {
      const { status, retryAfterMs } = errorInfo(e);
      // A schema miss is the model's fault, not the provider's health.
      if ((e as Error)?.message !== "schema") await deps.recordResult(rung.provider, false, status, retryAfterMs);
      attempts.push({ spec, outcome: status ? `http_${status}` : (e as Error)?.name || "error" });
      deps.log?.({ ev: "ai", task, model: spec, rung: i + 1, rungMs: Date.now() - t0, status: "error", code: status });
    }
  }
  deps.log?.({ ev: "ai", task, status: "ghost", attempts: attempts.map((a) => `${a.spec}=${a.outcome}`) });
  throw new AllRungsFailed(task, attempts);
}
