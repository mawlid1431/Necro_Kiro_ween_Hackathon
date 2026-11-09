# Omens — design

- `omens { userId, topic, keywords[], strict, muted, matchCount, lastMatchAt? }` · `by_user`.
- `omenMatches { userId, omenId, itemId, reason, via ("ai" | "keyword"), seen, createdAt }`
  · `by_user_seen [userId, seen, createdAt]`, `by_omen [omenId, createdAt]`, `by_omen_item [omenId, itemId]`.
- Keywords: words of the topic minus stop words (reuses `words()` from `lib/ai/ghost.ts`); an item is a
  candidate when its title + excerpt contains every keyword (or any, for single-word topics).
- `items.ingest` schedules `omensNode.check({ userId, itemIds })` for fresh items.
- `omensNode.check` ("use node"): loads candidates via an internal query, confirms each with the ladder
  (task `omen`, private, schema `{ match: boolean, reason }`, 120 tokens), reserves quota through `aiUsage`,
  falls back to keyword rules (req 4), inserts matches idempotently.
- UI: `/omens` page (create, mute, delete, matches with Read / Séance / Resurrect), nav badge with unread
  count, optional browser notifications in a client hook.
- MCP: `get_omens` in `mcp.ts` + `tools.ts`.
