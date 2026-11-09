# Kindred — design

- New table `kindredIndex { userId, itemId, graveId, title, publishedAt, kindredId? }`
  · `by_user_published [userId, publishedAt]`, `by_item`. One small row per item, written by `items.ingest`
  (and deleted with the item). Keeps clustering reads tiny.
- `items.ingest` schedules `kindred.cluster({ userId })` when it inserted something.
- `kindred.cluster` (internal mutation): loads ≤ 500 index rows from the last 48 h, runs the tested pure
  `clusterKindred()` (`backend/lib/ai/kindred.ts`), and for each group of ≥ 2 picks a stable id
  (the existing `kindredId` of any member, else the oldest member's item id). Patches only rows whose id
  changed, on both `kindredIndex` and `items`.
- `items.get` returns `kindred: [{ _id, title, graveTitle }]` siblings via `items.by_kindred`.
- UI: badge in the reading pane and a "≈" marker in the list; siblings open in the reader.
