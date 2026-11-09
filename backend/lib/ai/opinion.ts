// Second Opinion: pure helpers (spec .kiro/specs/second-opinion).
import type { OpinionOutput } from "./prompts";

export const MAX_SOURCES = 4;
export const labelFor = (i: number) => `S${i + 1}`;

/**
 * Keeps only citations of sources that are really in the group, so a model cannot cite
 * an outside or invented source. Points left without enough valid sources are dropped:
 * "agree" needs two distinct sources, "differ" two distinct views, "onlyOne" one source.
 */
export function filterCitations(out: OpinionOutput, valid: string[]): OpinionOutput {
  const ok = new Set(valid);
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => ok.has(x)))];
  return {
    agree: out.agree.map((a) => ({ point: a.point, sources: uniq(a.sources) })).filter((a) => a.sources.length >= 2),
    differ: out.differ
      .map((d) => {
        const seen = new Set<string>();
        const views = d.views.filter((v) => ok.has(v.source) && !seen.has(v.source) && seen.add(v.source));
        return { point: d.point, views };
      })
      .filter((d) => d.views.length >= 2),
    onlyOne: out.onlyOne.filter((o) => ok.has(o.source)),
  };
}

export const isEmptyOpinion = (o: OpinionOutput) => !o.agree.length && !o.differ.length && !o.onlyOne.length;
