# Learning memory — tasks

- [x] 1. `lib/ai/learn.ts`: weights, 30-day decay, recurring subjects, `learnedContext` (req 1, 2, 3; unit tests)
- [x] 2. Schema: `users.learned`, `learningOff`, `learnedResetAt`, `learnQueuedAt` (req 6, 7)
- [x] 3. `convex/learning.ts`: `scheduleLearn` from star, Séance, Resurrect and post; `refresh`; nightly `refreshAll`;
      `mine`, `setEnabled`, `reset` (req 1, 5, 6)
- [x] 4. Prompts: learned line in the Séance; real published posts as Resurrect voice examples (req 4)
- [x] 5. Settings card: topic bars, subjects, sources, the exact AI line, on/off and reset (req 6)
- [x] 6. convex-tests: learns from stars, reaches the Séance context, off and reset work, never crosses users (req 3, 6, 7)
- [x] 7. Fix found while recording the demo: quick actions share one refresh and later ones queue a new one, so no
      action waits for the nightly run (req 5; test "counts every action")
- [x] 8. Deployed to dev and production; checked live in a second tab (starring 3 articles updated the card)
