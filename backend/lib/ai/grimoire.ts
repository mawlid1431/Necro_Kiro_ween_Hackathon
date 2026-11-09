// Grimoire: weekly newsletter draft. Pure helpers (spec .kiro/specs/grimoire).

export const MAX_PICKS = 7;
export const refFor = (i: number) => `I${i + 1}`;

export interface GrimoireCandidate {
  id: string;
  kindredId?: string;
  starred: boolean;
  omen: boolean;
  score?: number;
  publishedAt: number;
}

/** Starred first, then Omen matches, then relevance; newest breaks ties. One item per Kindred group. */
export function pickGrimoire<T extends GrimoireCandidate>(candidates: T[], max = MAX_PICKS): T[] {
  const weight = (c: GrimoireCandidate) => (c.starred ? 1000 : 0) + (c.omen ? 500 : 0) + (c.score ?? 0);
  const sorted = [...new Map(candidates.map((c) => [c.id, c])).values()].sort((a, b) => weight(b) - weight(a) || b.publishedAt - a.publishedAt);
  const groups = new Set<string>();
  const out: T[] = [];
  for (const c of sorted) {
    if (c.kindredId) {
      if (groups.has(c.kindredId)) continue;
      groups.add(c.kindredId);
    }
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export interface GrimoireDraft {
  title: string;
  intro: string;
  sections: { ref: string; body: string }[];
  outro: string;
}

/** Keeps only sections about picked items, each item once, in the model's order. */
export function filterSections(d: GrimoireDraft, valid: string[]): GrimoireDraft {
  const ok = new Set(valid);
  const seen = new Set<string>();
  return { ...d, sections: d.sections.filter((s) => ok.has(s.ref) && !seen.has(s.ref) && !!seen.add(s.ref)) };
}

export interface PickedItem {
  ref: string;
  title: string;
  link: string;
  source: string;
  points: string[]; // Séance bullets or the excerpt
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/** Escapes the characters that would break a Markdown link label. */
const mdLabel = (s: string) => oneLine(s).replace(/([\\[\]])/g, "\\$1");
// Parentheses and spaces would end a Markdown link early; encodeURIComponent leaves "(" and ")" alone.
const URL_ESCAPES: Record<string, string> = { "(": "%28", ")": "%29", " ": "%20" };
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u.replace(/\s+/g, " ").replace(/[() ]/g, (ch) => URL_ESCAPES[ch]) : "");

/** Server-side Markdown, so links always point at the real items whatever the model wrote. */
export function renderMarkdown(d: GrimoireDraft, items: PickedItem[]): string {
  const byRef = new Map(items.map((i) => [i.ref, i]));
  const parts = [`# ${oneLine(d.title)}`, "", d.intro.trim(), ""];
  for (const s of d.sections) {
    const it = byRef.get(s.ref);
    if (!it) continue;
    const url = safeUrl(it.link);
    parts.push(`## ${url ? `[${mdLabel(it.title)}](${url})` : mdLabel(it.title)}`, `*${oneLine(it.source)}*`, "", s.body.trim(), "");
  }
  parts.push(d.outro.trim());
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Template newsletter when no AI answers: titles and key points, honest and plain. */
export function ghostGrimoire(items: PickedItem[], weekOf: string): GrimoireDraft {
  return {
    title: `What I read this week (${weekOf})`,
    intro: `${items.length === 1 ? "One piece" : `${items.length} pieces`} worth your time this week.`,
    sections: items.map((i) => ({ ref: i.ref, body: i.points.slice(0, 2).map((p) => `- ${oneLine(p)}`).join("\n") || "Worth a read." })),
    outro: "That's it for this week. Reply and tell me what you're reading.",
  };
}
