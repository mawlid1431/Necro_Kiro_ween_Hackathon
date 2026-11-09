# Covens — tasks

- [ ] 1. Schema: `collections`, `collectionFollows`, `collectionReports`, `users.displayName` (req 1, 4)
- [ ] 2. `covens.ts`: create/update/remove with ownership, limits, publish rate limit, SSRF check (req 1, 2, 9, 12)
- [ ] 3. `discover`, `get`, `trendingFeeds` built only from public, non-hidden rows (req 3, 4, 7)
- [ ] 4. `follow`/`unfollow`, `subscribeAll` via `graves.createMany`, `report` with auto-hide (req 5, 6, 8)
- [ ] 5. HTTP: OPML and starred RSS per collection (req 10, 11)
- [ ] 6. `seedStarters`: curated starter collections, feeds validated live before publishing
- [ ] 7. convex-tests: isolation, unlisted not in Discover, hidden after 3 reports, subscribeAll dedupe/cap,
      no email or private data in any response (req 2–9)
- [ ] 8. Frontend: `/discover`, detail panel, publish dialog, nav link, empty-state link, display name (brand rules)
- [ ] 9. Deploy dev + prod, seed starters, verify on necro.malitos.tech
