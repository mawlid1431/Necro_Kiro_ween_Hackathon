# Privacy & trust — design

- `users.privateMode` (optional boolean). The ladder's `runWithLadder` already filters rungs for private
  tasks; it gains a `forcePrivate` flag that callers set from the user's setting.
- `users.setPrivateMode`, `users.setDisplayName`, `users.exportData` (query, JSON).
- `users.deleteBatch` extended to every new table.
- Settings: Privacy card (Private mode switch, display name), Your data card (Export, Delete account with
  typed confirmation).
- Tests: convex-test for the goal flow (store → summon via createMany → ingest → Séance save → drafts) and
  for delete covering new tables; `frontend/scripts/smoke.ts` (Bun) hits the live landing page, a public
  OPML URL and `/api/mcp` auth responses.
