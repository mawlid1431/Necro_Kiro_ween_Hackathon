import { words } from "./ghost";

// Kindred spirits: group the same story reported by several feeds.
// Deterministic first pass (title shingles); embeddings can tighten it later.
export function shingles(title: string): Set<string> {
  const w = words(title).filter((x) => x.length > 2);
  const out = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) out.add(`${w[i]} ${w[i + 1]}`);
  for (const x of w) if (x.length > 5) out.add(x);
  return out;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface KindredInput { id: string; graveId: string; title: string; publishedAt: number }

// Items from different feeds, within 48 h, with Jaccard >= threshold join one cluster.
export function clusterKindred(items: KindredInput[], threshold = 0.3): string[][] {
  const sh = items.map((i) => shingles(i.title));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].graveId === items[j].graveId) continue;
      if (Math.abs(items[i].publishedAt - items[j].publishedAt) > 48 * 3600_000) continue;
      if (similarity(sh[i], sh[j]) >= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, string[]>();
  items.forEach((it, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), it.id]));
  return [...groups.values()].filter((g) => g.length > 1);
}
