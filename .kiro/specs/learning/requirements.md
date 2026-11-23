# Learning memory — requirements

Settings section: **What Necro learned** · *Your AI gets better at knowing you, day by day*.

## Problem
The hosted AI models cannot be retrained per user, so every Séance and draft only knew the interests a user typed once.
Readers change; their typed interests do not.

## Acceptance criteria (EARS)
1. THE SYSTEM SHALL learn only from the user's own actions: posted (weight 5), drafted (3), starred (3), summarised (1),
   with a 30-day half-life so recent habits count more.
2. THE SYSTEM SHALL keep topics (share of engagement), recurring subjects (words seen in 2+ articles) and top sources.
3. WHEN fewer than 3 actions exist THE SYSTEM SHALL send nothing to the AI (never an invented profile).
4. THE SYSTEM SHALL add the learned line to the Séance prompt (relevance weighs stated interests first, learned second)
   and use the user's real published posts as voice examples when they saved fewer than 3 samples.
5. THE SYSTEM SHALL refresh after an action (debounced to once per 10 minutes) and nightly for everyone.
6. THE SYSTEM SHALL show the profile and the exact prompt line in Settings, and let the user turn learning off or reset it.
7. THE SYSTEM SHALL never share the profile with other users or include it in any public view.

## Tasks
- [x] `lib/ai/learn.ts`: weights, decay, terms, `learnedContext` (unit tests)
- [x] `users.learned`, `learningOff`, `learnedResetAt`, `learnQueuedAt`
- [x] `convex/learning.ts`: `scheduleLearn` (star, Séance, Resurrect, post), `refresh`, nightly `refreshAll`, `mine`, `setEnabled`, `reset`
- [x] Prompts: learned line in the Séance; real published posts as Resurrect voice examples
- [x] Settings card with bars, subjects, sources, "exactly what the AI receives", off and reset
- [x] convex-test: learns from stars, reaches the Séance context, off and reset work, never crosses users
