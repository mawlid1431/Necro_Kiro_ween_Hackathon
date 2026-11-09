// "Ghost mode": deterministic Séance used when every AI provider is down or over budget.
// Never as good as a model, never fails, and is labelled in the UI ("summary without AI").

export const STOP = new Set(
  "a an the and or but if of to in on for with at by from as is are was were be been it its this that these those you your we our they their he she his her i me my not no so do does did have has had will would can could should may might about into than then there here what which who whom how why when where all any some more most such only own same very just also over after before".split(" "),
);

export function words(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function sentences(text: string): string[] {
  // Split only where end punctuation is followed by whitespace, so "Qwen 3.8" or "e.g.x" stay whole.
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 320);
}

export function ghostSeance(input: { title: string; text: string; interests: string[] }) {
  const sents = sentences(input.text);
  const freq = new Map<string, number>();
  for (const w of words(input.text)) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) ?? 0) + 1);
  const titleWords = new Set(words(input.title).filter((w) => !STOP.has(w)));

  const scored = sents.map((s, i) => {
    const ws = words(s).filter((w) => !STOP.has(w));
    const sum = ws.reduce((acc, w) => acc + (freq.get(w) ?? 0) + (titleWords.has(w) ? 3 : 0), 0);
    const position = i === 0 ? 1.5 : i < 3 ? 1.2 : 1;
    return { s, i, score: (sum / Math.max(ws.length, 1)) * position };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.i - b.i).map((x) => trim(x.s));
  while (top.length < 3) top.push(top.length === 0 ? trim(input.title || "Untitled") : "No further detail in the feed text.");

  // Relevance: share of interest tags found in title or text, weighted toward the title.
  const textWords = new Set(words(`${input.title} ${input.text}`));
  const tags = input.interests.filter((t) => words(t).length > 0);
  const hits = tags.filter((tag) => words(tag).every((w) => textWords.has(w)));
  const titleHits = tags.filter((tag) => words(tag).every((w) => titleWords.has(w)));
  const score = tags.length ? Math.min(100, Math.round(20 + 50 * (hits.length / tags.length) + 15 * titleHits.length)) : 50;
  const reason = hits.length ? `Mentions ${hits.slice(0, 3).join(", ")}.` : "No direct match with your interests.";
  return { summary: top, score, reason, model: "ghost:extractive" };
}

function trim(s: string): string {
  return s.length <= 220 ? s : s.slice(0, 217).replace(/\s+\S*$/, "") + "…";
}

/** Ghost Resurrect: a deterministic template draft, labelled "template draft" in the UI. */
export function ghostResurrect(input: { title: string; link: string; summary: string[]; interests: string[] }) {
  const title = input.title.trim() || "Worth a read";
  const bullets = input.summary.slice(0, 3).map((b) => `• ${b}`);
  const linkedin = [title, "", ...bullets, "", `Read more: ${input.link}`].join("\n").slice(0, 1300);
  const room = 280 - (input.link ? input.link.length + 1 : 0);
  const xTitle = title.length <= room ? title : title.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "…";
  const x = input.link ? `${xTitle} ${input.link}` : xTitle;
  const instagram = [title, "", ...bullets, "", "Link in bio"].join("\n").slice(0, 2200);

  const tags: string[] = [];
  for (const i of input.interests) {
    const tag = "#" + words(i).join("");
    if (tag.length > 1 && !tags.includes(tag)) tags.push(tag);
  }
  for (const fallback of ["#rss", "#reading", "#openweb"]) if (tags.length < 3 && !tags.includes(fallback)) tags.push(fallback);
  return { linkedin, x, instagram, hashtags: tags.slice(0, 6), model: "ghost:template" };
}
