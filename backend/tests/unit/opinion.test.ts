// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { filterCitations, isEmptyOpinion, labelFor } from "../../lib/ai/opinion";
import { chainFor } from "../../lib/ai/router";
import { OpinionSchema, opinionPrompt } from "../../lib/ai/prompts";

describe("second opinion helpers", () => {
  it("drops outside citations and points left without enough sources", () => {
    const out = filterCitations(
      {
        agree: [
          { point: "Shared point here", sources: ["S1", "S2", "S7"] },
          { point: "Only one real source", sources: ["S1", "S1", "S9"] },
        ],
        differ: [
          { point: "Price differs here", views: [{ source: "S1", says: "Ten dollars" }, { source: "S1", says: "Again S1" }, { source: "S2", says: "Twelve" }] },
          { point: "Outside view only", views: [{ source: "S1", says: "Yes" }, { source: "S5", says: "No" }] },
        ],
        onlyOne: [{ claim: "Real single claim", source: "S2" }, { claim: "Invented source", source: "X" }],
      },
      ["S1", "S2"],
    );
    expect(out.agree).toEqual([{ point: "Shared point here", sources: ["S1", "S2"] }]);
    expect(out.differ).toEqual([{ point: "Price differs here", views: [{ source: "S1", says: "Ten dollars" }, { source: "S2", says: "Twelve" }] }]);
    expect(out.onlyOne).toEqual([{ claim: "Real single claim", source: "S2" }]);
    expect(isEmptyOpinion({ agree: [], differ: [], onlyOne: [] })).toBe(true);
  });

  it("never returns a citation outside the valid labels (property)", () => {
    const lab = fc.constantFrom("S1", "S2", "S3", "S4", "S5", "S9", "x");
    const pt = fc.constant("A point of text");
    fc.assert(
      fc.property(
        fc.record({
          agree: fc.array(fc.record({ point: pt, sources: fc.array(lab, { maxLength: 4 }) }), { maxLength: 5 }),
          differ: fc.array(fc.record({ point: pt, views: fc.array(fc.record({ source: lab, says: pt }), { maxLength: 4 }) }), { maxLength: 4 }),
          onlyOne: fc.array(fc.record({ claim: pt, source: lab }), { maxLength: 5 }),
        }),
        fc.integer({ min: 2, max: 4 }),
        (o, n) => {
          const valid = Array.from({ length: n }, (_, i) => labelFor(i));
          const r = filterCitations(o, valid);
          const cited = [...r.agree.flatMap((a) => a.sources), ...r.differ.flatMap((d) => d.views.map((v) => v.source)), ...r.onlyOne.map((x) => x.source)];
          return cited.every((c) => valid.includes(c)) && r.agree.every((a) => a.sources.length >= 2) && r.differ.every((d) => d.views.length >= 2);
        },
      ),
    );
  });

  it("delimits and truncates each source, and borrows the Séance chain", () => {
    const p = opinionPrompt([{ label: "S1", feed: 'A "feed"', title: "T", text: "x".repeat(5000) }]);
    expect(p).toContain(`<article source="S1" feed="A 'feed'" title="T">`);
    expect(p.length).toBeLessThan(2300);
    expect(chainFor("opinion", { AI_CHAIN_SEANCE: "groq:a" })).toEqual(["groq:a"]);
    expect(OpinionSchema.safeParse({ agree: [], differ: [], onlyOne: [] }).success).toBe(true);
  });
});
