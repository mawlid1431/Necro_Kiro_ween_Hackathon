// Which of the user's feeds a question names ("What has Simon Willison written lately?", "anything new on The Verge?"),
// so Ask can include that feed's latest items even when no article title contains the words.

const GENERIC = new Set([
  "the", "and", "for", "with", "from", "blog", "weblog", "news", "feed", "feeds", "page", "front", "home", "latest",
  "daily", "weekly", "official", "medium", "online", "magazine", "journal", "podcast", "channel", "com", "www", "rss",
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Feeds whose distinctive title words all appear in the question (at most `max`, best match first). */
export function feedsNamedIn<T extends { title: string }>(question: string, feeds: T[], max = 3): T[] {
  const asked = new Set(words(question));
  const scored: { feed: T; hits: number }[] = [];
  for (const feed of feeds) {
    const distinctive = words(feed.title).filter((w) => w.length >= 3 && !GENERIC.has(w));
    if (!distinctive.length) continue;
    const hits = distinctive.filter((w) => asked.has(w)).length;
    // Every distinctive word must appear ("Simon Willison"), or two of them for long titles.
    if (hits === distinctive.length || hits >= 2) scored.push({ feed, hits });
  }
  return scored.sort((a, b) => b.hits - a.hits).slice(0, max).map((s) => s.feed);
}
