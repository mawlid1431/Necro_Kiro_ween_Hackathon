// @vitest-environment node
// Private mode (spec .kiro/specs/privacy-trust): every task skips rungs that may train on prompts.
import { describe, expect, it } from "vitest";
import type { LanguageModel } from "ai";
import { AllRungsFailed, runWithLadder, type RouterDeps } from "../../lib/ai/router";
import { classify, type Rung } from "../../lib/ai/providers";

const deps: RouterDeps = {
  resolve: (spec) => ({ spec, ...classify(spec), model: {} as LanguageModel }) as Rung,
  isOpen: async () => false,
  reserveBudget: async () => true,
  recordResult: async () => {},
};
const call = async (rung: Rung) => rung.spec;

describe("private mode", () => {
  it("a public task may use a free (training) rung normally", async () => {
    const r = await runWithLadder("seance", deps, call, () => true, undefined, ["openrouter:openrouter/free", "groq:x"]);
    expect(r.spec).toBe("openrouter:openrouter/free");
  });

  it("with Private mode the same task skips it and uses the next allowed rung", async () => {
    const r = await runWithLadder("seance", deps, call, () => true, undefined, ["openrouter:openrouter/free", "groq:x"], true);
    expect(r.spec).toBe("groq:x");
  });

  it("with Private mode and only training rungs left, it fails over to Ghost mode", async () => {
    const err = await runWithLadder("seance", deps, call, () => true, undefined, ["openrouter:openrouter/free"], true).catch((e) => e);
    expect(err).toBeInstanceOf(AllRungsFailed);
    expect((err as AllRungsFailed).attempts).toEqual([{ spec: "openrouter:openrouter/free", outcome: "privacy" }]);
  });
});
