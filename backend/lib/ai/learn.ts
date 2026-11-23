// Learning memory: Necro cannot retrain the hosted AI models, so it learns the reader instead.
// What a reader actually does (posts, drafts, stars, summaries they ask for) becomes a small weighted profile
// that is added to every AI prompt as context. It changes every day with the reader, is shown to them in
// Settings, can be switched off or reset, and contains only facts from their own activity (no guesses).

import { TOPIC_LABELS, type Topic } from "../topics";

export type SignalKind = "posted" | "drafted" | "starred" | "summarised";
export type Signal = { kind: SignalKind; topic?: Topic; title: string; feed?: string; at: number };

export type Learned = {
  topics: { topic: Topic; share: number }[]; // share of engagement, 0-100, strongest first
  terms: string[]; // recurring subjects in what they engage with
  feeds: string[]; // sources they engage with most
  signals: number; // how many actions this is based on
  updatedAt: number;
};

/** How much one action says about a reader. Posting something is the strongest signal. */
export const SIGNAL_WEIGHT: Record<SignalKind, number> = { posted: 5, drafted: 3, starred: 3, summarised: 1 };
export const HALF_LIFE_DAYS = 30; // last month's habits count twice as much as the month before
export const MIN_SIGNALS = 3; // below this the profile is too thin to be worth sending

const DAY = 86_400_000;
const STOP = new Set(
  ("about above after again against also among another because been before being below between both could does doing down during each " +
    "from further have having here into itself just more most much must need only other over same should since some such than that their " +
    "them then there these they this those through under until very what when where which while will with within without would your yours " +
    "says said year years week today new news first last best make made makes using used uses really still even ever every like just how " +
    "why who whom whose amid via versus inside outside here's it's what's don't can't won't isn't aren't")
    .split(/\s+/),
);

function decay(at: number, now: number): number {
  const ageDays = Math.max(0, (now - at) / DAY);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function words(title: string): string[] {
  return (title.toLowerCase().match(/[\p{L}][\p{L}\p{N}+#.-]{2,}/gu) ?? [])
    .map((w) => w.replace(/[.-]+$/, ""))
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w));
}

export function learnProfile(signals: Signal[], now: number): Learned {
  const topic = new Map<Topic, number>();
  const term = new Map<string, { w: number; n: number }>();
  const feed = new Map<string, number>();
  let total = 0;
  for (const s of signals) {
    const w = SIGNAL_WEIGHT[s.kind] * decay(s.at, now);
    if (s.topic && s.topic !== "other") {
      topic.set(s.topic, (topic.get(s.topic) ?? 0) + w);
      total += w;
    }
    for (const t of new Set(words(s.title))) {
      const cur = term.get(t) ?? { w: 0, n: 0 };
      term.set(t, { w: cur.w + w, n: cur.n + 1 });
    }
    if (s.feed) feed.set(s.feed, (feed.get(s.feed) ?? 0) + w);
  }
  const topics = [...topic.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, w]) => ({ topic: t, share: Math.round((100 * w) / (total || 1)) }))
    .filter((t) => t.share >= 5);
  const terms = [...term.entries()]
    .filter(([, v]) => v.n >= 2) // a subject counts once it recurs
    .sort((a, b) => b[1].w - a[1].w)
    .slice(0, 12)
    .map(([t]) => t);
  const feeds = [...feed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f]) => f);
  return { topics, terms, feeds, signals: signals.length, updatedAt: now };
}

/** The line added to AI prompts, or null when there is not enough to say (never invent a profile). */
export function learnedContext(l: Learned | null | undefined): string | null {
  if (!l || l.signals < MIN_SIGNALS || (!l.topics.length && !l.terms.length)) return null;
  const parts: string[] = [];
  if (l.topics.length) parts.push(`topics ${l.topics.map((t) => `${TOPIC_LABELS[t.topic]} ${t.share}%`).join(", ")}`);
  if (l.terms.length) parts.push(`recurring subjects: ${l.terms.slice(0, 10).join(", ")}`);
  if (l.feeds.length) parts.push(`favourite sources: ${l.feeds.slice(0, 4).join(", ")}`);
  return `Learned from this reader's own activity (${l.signals} actions, recent ones count more): ${parts.join("; ")}.`;
}
