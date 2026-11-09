# Grimoire — requirements

Themed label: **Grimoire** · plain subtitle: **Weekly newsletter**.

## Problem
Creators spend hours each week writing a "best things I read" newsletter or LinkedIn roundup.

## Acceptance criteria (EARS)
1. WHEN the user composes a Grimoire THE SYSTEM SHALL pick up to 7 items from the last 7 days, preferring
   starred items, Omen matches and high relevance, with one item per Kindred group.
2. THE SYSTEM SHALL write a title, an intro, one short section per item (with its link) and an outro in the
   user's voice profile. This is a **private** AI task.
3. Sections SHALL only reference picked items; invented items are removed.
4. IF AI is unavailable THE SYSTEM SHALL build a template newsletter from titles and Séance bullets.
5. The user SHALL be able to edit the draft and copy it as Markdown or plain text.
6. THE SYSTEM SHALL keep past Grimoires and limit composing to 10 per day.
