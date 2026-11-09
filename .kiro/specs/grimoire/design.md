# Grimoire — design

- `grimoires { userId, weekOf, title, markdown, itemIds[], model, updatedAt }` · `by_user`.
- `grimoireNode.compose({ days? })` ("use node"): internal query picks candidates (starred, omen matches,
  score), dedupes by `kindredId`; ladder task `grimoire` (private), schema `GrimoireSchema`, item ids
  filtered to the picked set; renders Markdown on the server; Ghost template fallback; saves.
- `grimoires.list / get / update / remove`.
- UI: `/grimoire` page — Compose, editor (textarea), Copy Markdown / Copy text, history list.
