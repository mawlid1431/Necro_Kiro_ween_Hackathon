// @vitest-environment node
// The AI degradation ladder (Final Draft 7.3, 8.1-8.3): router, privacy routing, breakers, budgets.
import { describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { AllRungsFailed, chainFor, errorInfo, runWithLadder, type RouterDeps } from "../../lib/ai/router";
import { classify } from "../../lib/ai/providers";
import type { Rung } from "../../lib/ai/providers";
import { freshBreaker, isOpen, onFailure, onSuccess, type Breaker } from "../../lib/ai/breaker";
import { budgetFor } from "../../lib/ai/budgets";

const fakeModel = {} as LanguageModel; // never called: `call` below is a stub

function deps(over: Partial<RouterDeps> = {}): RouterDeps & { results: [string, boolean, number?][] } {
  const results: [string, boolean, number?][] = [];
  return {
    results,
    resolve: (spec) => ({ spec, ...classify(spec), model: fakeModel }) as Rung,
    isOpen: async () => false,
    reserveBudget: async () => true,
    recordResult: async (p, ok, status) => void results.push([p, ok, status]),
    ...over,
  };
}

const CHAIN = ["groq:llama-x", "google:gemini-flash", "openrouter:openrouter/free"];

describe("router", () => {
  it("returns the first rung that answers", async () => {
    const d = deps();
    const r = await runWithLadder("seance", d, async (rung) => rung.spec, () => true, undefined, CHAIN);
    expect(r).toMatchObject({ out: "groq:llama-x", spec: "groq:llama-x", rung: 1 });
    expect(d.results).toEqual([["groq", true, undefined]]);
  });

  it("falls through failing rungs and records each failure with its status", async () => {
    const d = deps();
    const call = vi.fn(async (rung: Rung) => {
      if (rung.provider === "groq") throw Object.assign(new Error("rate"), { statusCode: 429 });
      if (rung.provider === "google") throw new Error("boom");
      return "ok";
    });
    const r = await runWithLadder("seance", d, call, () => true, undefined, CHAIN);
    expect(r.rung).toBe(3);
    expect(d.results).toEqual([["groq", false, 429], ["google", false, undefined], ["openrouter-free", true, undefined]]);
  });

  it("never sends private tasks to providers that may train on prompts", async () => {
    const seen: string[] = [];
    const d = deps();
    await expect(
      runWithLadder("resurrect", d, async (rung) => { seen.push(rung.spec); throw new Error("x"); }, () => true, undefined, CHAIN),
    ).rejects.toBeInstanceOf(AllRungsFailed);
    expect(seen).toEqual(["groq:llama-x"]); // google free tier and openrouter/free were filtered out
  });

  it("skips open breakers and spent budgets without calling the provider", async () => {
    const call = vi.fn(async (rung: Rung) => rung.spec);
    const d = deps({ isOpen: async (p) => p === "groq", reserveBudget: async (p) => p !== "google" });
    const r = await runWithLadder("seance", d, call, () => true, undefined, CHAIN);
    expect(r.spec).toBe("openrouter:openrouter/free");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("skips rungs whose key is missing", async () => {
    const d = deps({ resolve: (spec) => { if (spec.startsWith("groq")) throw new Error("GROQ_API_KEY is not set"); return { spec, ...classify(spec), model: fakeModel } as Rung; } });
    const r = await runWithLadder("seance", d, async (rung) => rung.spec, () => true, undefined, CHAIN);
    expect(r.rung).toBe(2);
  });

  it("repairs once on the same rung, then moves on; schema misses do not trip the breaker", async () => {
    const d = deps();
    const repair = vi.fn(async (rung: Rung) => (rung.provider === "groq" ? "still bad" : "good"));
    const r = await runWithLadder("seance", d, async () => "bad", (o) => o === "good", repair, CHAIN);
    expect(r.rung).toBe(2);
    expect(repair).toHaveBeenCalledTimes(2);
    expect(d.results).toEqual([["google", true, undefined]]);
  });

  it("throws AllRungsFailed with every attempt so the caller can use Ghost mode", async () => {
    const d = deps({ isOpen: async () => true });
    try {
      await runWithLadder("seance", d, async () => "x", () => true, undefined, CHAIN);
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(AllRungsFailed);
      expect((e as AllRungsFailed).attempts.map((a) => a.outcome)).toEqual(["breaker_open", "breaker_open", "breaker_open"]);
    }
  });

  it("reads chains from AI_CHAIN_* and falls back to the older per-task vars", () => {
    expect(chainFor("seance", { AI_CHAIN_SEANCE: " groq:a , google:b,groq:a " })).toEqual(["groq:a", "google:b"]);
    expect(chainFor("doctor", { AI_DOCTOR_MODEL: "groq:x", AI_FALLBACK_MODEL: "openrouter:y" })).toEqual(["groq:x", "openrouter:y"]);
    expect(chainFor("ask", {})).toEqual([]);
  });

  it("extracts status and retry-after from wrapped SDK errors", () => {
    expect(errorInfo({ statusCode: 429, responseHeaders: { "retry-after": "30" } })).toEqual({ status: 429, retryAfterMs: 30_000 });
    expect(errorInfo({ lastError: { statusCode: 503 } })).toEqual({ status: 503, retryAfterMs: undefined });
    expect(errorInfo(new Error("x"))).toEqual({ status: undefined, retryAfterMs: undefined });
  });
});

describe("privacy classification", () => {
  it("flags free tiers that may train on prompts", () => {
    expect(classify("google:gemini-flash")).toEqual({ provider: "google", trainsOnPrompts: true });
    expect(classify("openrouter:google/gemma-4-31b-it:free")).toEqual({ provider: "openrouter-free", trainsOnPrompts: true });
    expect(classify("openrouter:openrouter/free")).toEqual({ provider: "openrouter-free", trainsOnPrompts: true });
    expect(classify("openrouter:anthropic/some-paid-model")).toEqual({ provider: "openrouter", trainsOnPrompts: false });
    expect(classify("groq:openai/gpt-oss-120b")).toEqual({ provider: "groq", trainsOnPrompts: false });
  });
});

describe("circuit breaker", () => {
  const t = 1_000_000;

  it("opens after 5 failures within 2 minutes, then half-opens after the cool-down", () => {
    let b = freshBreaker(t);
    for (let i = 0; i < 4; i++) b = onFailure(b, t + i * 1000);
    expect(isOpen(b, t + 5000)).toBe(false);
    b = onFailure(b, t + 5000);
    expect(isOpen(b, t + 6000)).toBe(true);
    expect(isOpen(b, t + 5000 + 60_000)).toBe(false); // half-open: one request may pass
  });

  it("doubles the cool-down when the half-open probe fails, up to 30 minutes", () => {
    let b: Breaker = { ...freshBreaker(t), state: "open", openedUntil: t, cooldownMs: 60_000 };
    b = onFailure(b, t + 1);
    expect(b.cooldownMs).toBe(120_000);
    for (let i = 0; i < 10; i++) b = onFailure({ ...b, openedUntil: t }, t + 1);
    expect(b.cooldownMs).toBe(30 * 60_000);
  });

  it("opens at once on 429 (respecting retry-after) and for an hour on a bad key", () => {
    expect(onFailure(null, t, 429, 120_000).openedUntil).toBe(t + 120_000);
    expect(onFailure(null, t, 429, 1000).openedUntil).toBe(t + 60_000); // minimum 60 s
    expect(onFailure(null, t, 401).openedUntil).toBe(t + 3_600_000);
  });

  it("forgets old failures outside the window and closes on success", () => {
    let b = freshBreaker(t);
    for (let i = 0; i < 4; i++) b = onFailure(b, t);
    b = onFailure(b, t + 3 * 60_000); // new window
    expect(b.failures).toBe(1);
    expect(onSuccess(t).state).toBe("closed");
  });
});

describe("budgets", () => {
  it("defaults to 80% of free limits and accepts env overrides", () => {
    expect(budgetFor("groq", {})).toEqual({ perMinute: 24, perDay: 800 });
    expect(budgetFor("openrouter-free", { AI_BUDGET_OPENROUTER_FREE: "16,40" })).toEqual({ perMinute: 16, perDay: 40 });
    expect(budgetFor("unknown", {})).toEqual({ perMinute: 20, perDay: 500 });
  });
});
