# Second Opinion — requirements

Themed label: **Second Opinion** · plain subtitle: **Compare sources**.

## Problem
One source can be biased, incomplete or wrong. Readers rarely have time to compare coverage.

## Acceptance criteria (EARS)
1. WHEN an item belongs to a Kindred group with items from 2+ feeds THE SYSTEM SHALL offer a Second Opinion.
2. THE SYSTEM SHALL compare up to 4 sources and return: points they agree on, points where they differ
   (with which source says what) and claims made by only one source.
3. Every point SHALL cite sources that are in the group; citations outside the group are removed.
4. Article text is untrusted: delimited, truncated, never obeyed; output validated with Zod.
5. IF AI is unavailable THE SYSTEM SHALL show the sources side by side with their first key sentences.
6. THE SYSTEM SHALL cache one Second Opinion per group per user and limit generation to 30 per day.
