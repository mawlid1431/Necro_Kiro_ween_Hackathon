# Omens — requirements

Themed label: **Omens** · plain subtitle: **Topic alerts**.

## Problem
People cannot read every feed. They need to know the moment their topic appears (a competitor, a
vulnerability, a research area) without false alarms from a word that merely appears.

## Acceptance criteria (EARS)
1. A signed-in user SHALL be able to create up to 20 Omens, each a topic of 3–60 characters, optionally strict.
2. WHEN new items (published in the last 7 days) are ingested THE SYSTEM SHALL pre-filter them against the
   user's Omens by keywords, then confirm candidates with AI when quota allows.
3. Omen matching is a **private** AI task: topics never reach providers that may train on prompts.
4. IF AI is unavailable or the daily confirmation limit (200) is reached THE SYSTEM SHALL keep keyword
   matches for non-strict Omens and label them "keyword match".
5. THE SYSTEM SHALL record each (Omen, item) match once, with a one-line reason.
6. THE SYSTEM SHALL show the unread match count in the navigation and list matches per Omen.
7. WHEN the user allows browser notifications THE SYSTEM SHALL notify on new matches while Necro is open.
8. From a match the user SHALL reach the item, its Séance and Resurrect in one tap.
9. THE MCP server SHALL expose `get_omens` (topics and recent matches).
10. One user SHALL never see another user's Omens or matches.
