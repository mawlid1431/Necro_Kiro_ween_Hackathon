// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { filterSections, ghostGrimoire, pickGrimoire, renderMarkdown } from "../../lib/ai/grimoire";
import { chainFor, TASK_PRIVACY } from "../../lib/ai/router";

const c = (id: string, o: Partial<{ kindredId: string; starred: boolean; omen: boolean; score: number; publishedAt: number }> = {}) => ({
  id,
  starred: false,
  omen: false,
  publishedAt: 0,
  ...o,
});

describe("grimoire picker", () => {
  it("prefers starred, then omen matches, then relevance, one per Kindred group, max 7", () => {
    const picked = pickGrimoire([
      c("low", { score: 10 }),
      c("high", { score: 90 }),
      c("omen", { omen: true }),
      c("star", { starred: true }),
      c("twinA", { kindredId: "k", score: 80 }),
      c("twinB", { kindredId: "k", score: 70 }),
    ]);
    expect(picked.map((p) => p.id)).toEqual(["star", "omen", "high", "twinA", "low"]);
    expect(pickGrimoire(Array.from({ length: 20 }, (_, i) => c(`i${i}`, { score: i })))).toHaveLength(7);
  });

  it("never returns two items of one group or duplicates (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h", "i"), kindredId: fc.option(fc.constantFrom("k1", "k2"), { nil: undefined }), starred: fc.boolean(), omen: fc.boolean(), score: fc.integer({ min: 0, max: 100 }), publishedAt: fc.nat() })),
        (cs) => {
          const p = pickGrimoire(cs);
          const groups = p.map((x) => x.kindredId).filter(Boolean);
          return p.length <= 7 && new Set(p.map((x) => x.id)).size === p.length && new Set(groups).size === groups.length;
        },
      ),
    );
  });
});

describe("grimoire rendering", () => {
  const items = [
    { ref: "I1", title: "A [weird] title", link: "https://a.test/x (1)", source: "Alpha", points: ["Point one.", "Point two.", "Point three."] },
    { ref: "I2", title: "No link", link: "javascript:alert(1)", source: "Beta", points: [] },
  ];

  it("drops sections about items that were not picked, and repeats", () => {
    const d = filterSections({ title: "T", intro: "I", outro: "O", sections: [{ ref: "I1", body: "x" }, { ref: "I9", body: "y" }, { ref: "I1", body: "z" }] }, ["I1", "I2"]);
    expect(d.sections).toEqual([{ ref: "I1", body: "x" }]);
  });

  it("links only to real http(s) items and escapes link labels", () => {
    const md = renderMarkdown({ title: "Week", intro: "Hello.", outro: "Bye.", sections: [{ ref: "I1", body: "About A." }, { ref: "I2", body: "About B." }] }, items);
    expect(md).toContain("## [A \\[weird\\] title](https://a.test/x%20%281%29)");
    expect(md).toContain("## No link\n");
    expect(md).not.toContain("javascript:");
    expect(md.startsWith("# Week\n")).toBe(true);
  });

  it("builds a template without AI from titles and key points", () => {
    const d = ghostGrimoire(items, "2026-11-09");
    expect(d.title).toContain("2026-11-09");
    expect(d.sections[0].body).toBe("- Point one.\n- Point two.");
    expect(d.sections[1].body).toBe("Worth a read.");
  });

  it("is private and borrows the Resurrect chain", () => {
    expect(TASK_PRIVACY.grimoire).toBe("private");
    expect(chainFor("grimoire", { AI_CHAIN_RESURRECT: "groq:r" })).toEqual(["groq:r"]);
  });
});
