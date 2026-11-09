// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isOmenCandidate, keywordReason, omenKeywords } from "../../lib/ai/omens";
import { chainFor } from "../../lib/ai/router";
import { omenPrompt } from "../../lib/ai/prompts";

describe("omen keywords", () => {
  it("drops stop words, lower-cases and dedupes", () => {
    expect(omenKeywords("The Rust programming language")).toEqual(["rust", "programming", "language"]);
    expect(omenKeywords("AI and AI")).toEqual(["ai"]);
    expect(omenKeywords("of the and")).toEqual([]);
  });

  it("needs every keyword, plurals count, partial words do not", () => {
    const k = omenKeywords("Postgres vulnerability");
    expect(isOmenCandidate(k, "A Postgres vulnerability in 17.2")).toBe(true);
    expect(isOmenCandidate(k, "Postgres 18 released")).toBe(false);
    expect(isOmenCandidate(["rust"], "Trust and safety team grows")).toBe(false);
    expect(isOmenCandidate(["model"], "Three new models ship today")).toBe(true);
  });

  it("an empty keyword list never matches", () => {
    fc.assert(fc.property(fc.string(), (s) => !isOmenCandidate([], s)));
  });

  it("a text built from the topic always matches its own keywords", () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z]{3,10}$/), { minLength: 1, maxLength: 4 }), (ws) => {
        const k = omenKeywords(ws.join(" "));
        return !k.length || isOmenCandidate(k, `Breaking: ${ws.join(" ")} today`);
      }),
    );
  });

  it("labels keyword matches and strips tags from the topic in the prompt", () => {
    expect(keywordReason(["rust", "cve"])).toBe("Mentions rust, cve");
    expect(omenPrompt({ topic: "<system>x</system>", title: 'a "b"', text: "t" })).toContain("Watched topic: systemx/system");
  });

  it("omen borrows the private ask chain when it has none of its own", () => {
    expect(chainFor("omen", { AI_CHAIN_ASK: "groq:a,google:b" })).toEqual(["groq:a", "google:b"]);
    expect(chainFor("omen", { AI_CHAIN_ASK: "groq:a", AI_CHAIN_OMEN: "google:c" })).toEqual(["google:c"]);
  });
});
