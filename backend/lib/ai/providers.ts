// Provider resolution: turns a `provider:model-id` spec into an AI SDK model.
// Imported only from "use node" Convex actions, so keys come from Convex env vars.
// Only the first ":" splits provider from id, so OpenRouter's ":free" suffix survives.
//
//   groq:<id>        Groq (fast; free tier limits are per organisation)
//   google:<id>      Gemini API (free tier MAY train on prompts unless GOOGLE_PAID_TIER=true)
//   openrouter:<id>  OpenRouter; ids ending ":free" and "openrouter/free" may train on prompts
//   mock:<task>      fixed output, only when AI_ALLOW_MOCK=true (tests, offline demos)
// Vercel AI Gateway ("gateway:") is optional in the Final Draft and not wired.
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { mockModel } from "./mock";

export interface Rung {
  spec: string;
  /** Circuit-breaker and budget key. Free OpenRouter models fail independently of paid ones. */
  provider: string;
  model: LanguageModel;
  trainsOnPrompts: boolean;
}

export function splitSpec(spec: string): { provider: string; id: string } {
  const i = spec.indexOf(":");
  if (i <= 0 || i === spec.length - 1) throw new Error(`AI model spec "${spec}" must look like provider:model-id`);
  return { provider: spec.slice(0, i), id: spec.slice(i + 1) };
}

/** Pure: which breaker/budget bucket and privacy class a spec belongs to. Unit tested. */
export function classify(spec: string): { provider: string; trainsOnPrompts: boolean } {
  const { provider, id } = splitSpec(spec);
  if (provider === "google") return { provider: "google", trainsOnPrompts: process.env.GOOGLE_PAID_TIER !== "true" };
  if (provider === "openrouter") {
    const free = id.endsWith(":free") || id === "openrouter/free";
    return { provider: free ? "openrouter-free" : "openrouter", trainsOnPrompts: free };
  }
  return { provider, trainsOnPrompts: false };
}

let groq: ReturnType<typeof createGroq> | undefined;
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;
let openrouter: ReturnType<typeof createOpenRouter> | undefined;

/** Builds the model. Throws when the provider's key is missing, so the router skips that rung. */
export function resolveRung(spec: string): Rung {
  const { provider, id } = splitSpec(spec);
  const c = classify(spec);
  const rung = (model: LanguageModel): Rung => ({ spec, provider: c.provider, model, trainsOnPrompts: c.trainsOnPrompts });
  switch (provider) {
    case "groq":
      if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
      groq ??= createGroq({ apiKey: process.env.GROQ_API_KEY });
      return rung(groq(id));
    case "google":
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
      google ??= createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
      return rung(google(id));
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
      openrouter ??= createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
        headers: { "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "Necro" },
      });
      return rung(openrouter(id));
    case "mock":
      if (process.env.AI_ALLOW_MOCK === "true") return rung(mockModel(id));
      break;
  }
  throw new Error(`Unknown or disabled AI model spec "${spec}"`);
}
