# The Circle — tasks

- [x] 1. Schema: `follows`, `sharedPosts`, profile fields and counters (req 1, 3, 6)
- [x] 2. `circle.recordShared` from `finishPublish` and `markShared`, idempotent, safe feed URLs (req 3, 4, 5)
- [x] 3. `setProfile`, `follow`, `unfollow` with limits and exact counters (req 2, 6)
- [x] 4. `following`, `inMyTopics`, `people`, `profile` with read-time visibility (req 7, 8, 9)
- [x] 5. Account deletion: follows both ways and shared posts (req 11)
- [x] 6. convex-tests: privacy, exactly-once, live hiding, counters, deletion, feed URL filter (10 tests)
- [x] 7. Frontend: `/circle` tabs, profile card, `/circle/[slug]`, Follow button, "Add this feed" (req 10), nav item
- [x] 8. Demo people (`seedCircle:seed`, marked isDemo) and a live check: a new post appears in Following without reload
- [ ] 9. Deploy to prod and check on necro.malitos.tech
