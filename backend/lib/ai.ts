// AI provider layer. Imported only from "use node" Convex actions, so keys come
// from Convex environment variables and never reach the browser.
//
// Each task's model is an env var written as `provider:model-id`, e.g.
//   AI_SEANCE_MODEL=groq:openai/gpt-oss-120b
//   AI_RESURRECT_MODEL=openrouter:google/gemma-4-31b-it:free
// Only the first ":" separates provider from id, so OpenRouter's ":free" suffix survives.
// Vercel AI Gateway ("gateway:") is optional in the build prompt and not wired yet.
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { mockModel } from "./ai-mock";

export type AiTask = "seance" | "resurrect" | "doctor";
export type ResolvedModel = { spec: string; model: LanguageModel };

const TASK_ENV: Record<AiTask, string> = {
  seance: "AI_SEANCE_MODEL",
  resurrect: "AI_RESURRECT_MODEL",
  doctor: "AI_DOCTOR_MODEL",
};

// Created lazily so a missing key only fails the provider that needs it.
let groq: ReturnType<typeof createGroq> | undefined;
let openrouter: ReturnType<typeof createOpenRouter> | undefined;

export function resolveModel(spec: string): ResolvedModel {
  const i = spec.indexOf(":");
  if (i <= 0) throw new Error(`AI model spec "${spec}" must look like provider:model-id`);
  const provider = spec.slice(0, i);
  const id = spec.slice(i + 1);
  switch (provider) {
    case "groq":
      if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
      groq ??= createGroq({ apiKey: process.env.GROQ_API_KEY });
      return { spec, model: groq(id) };
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
      openrouter ??= createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
        headers: { "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "Necro" },
      });
      return { spec, model: openrouter(id) };
    case "mock":
      if (process.env.AI_ALLOW_MOCK === "true") return { spec, model: mockModel(id) };
      break;
  }
  throw new Error(`Unknown or disabled AI model spec "${spec}"`);
}

export function modelsFor(task: AiTask): ResolvedModel[] {
  const primary = process.env[TASK_ENV[task]];
  if (!primary) throw new Error(`${TASK_ENV[task]} is not set`);
  const fallback = process.env.AI_FALLBACK_MODEL;
  const specs = fallback && fallback !== primary ? [primary, fallback] : [primary];
  const out: ResolvedModel[] = [];
  for (const s of specs) {
    try {
      out.push(resolveModel(s));
    } catch (err) {
      // A misconfigured fallback must not block a working primary (and vice versa).
      console.warn(`[ai] skipping ${s}:`, err instanceof Error ? err.message : err);
    }
  }
  if (!out.length) throw new Error(`No usable model for ${task}`);
  return out;
}

/** Try the task's primary model, then the fallback. Never loops retries. Rethrows the last error. */
export async function withFallback<T>(
  task: AiTask,
  run: (m: ResolvedModel) => Promise<T>,
): Promise<{ result: T; spec: string; usedFallback: boolean; ms: number }> {
  let lastError: unknown;
  const models = modelsFor(task);
  const started = Date.now();
  for (const [i, m] of models.entries()) {
    try {
      const result = await run(m);
      const ms = Date.now() - started;
      // Log only task, model, latency and status. Never prompts or outputs.
      console.log(JSON.stringify({ ev: "ai", task, model: m.spec, ms, fallback: i > 0, status: "ok" }));
      return { result, spec: m.spec, usedFallback: i > 0, ms };
    } catch (err) {
      lastError = err;
      console.warn(JSON.stringify({ ev: "ai", task, model: m.spec, status: "error", error: err instanceof Error ? err.message.slice(0, 200) : "unknown" }));
    }
  }
  throw lastError;
}
