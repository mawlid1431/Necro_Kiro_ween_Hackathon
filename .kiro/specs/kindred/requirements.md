# Kindred — requirements

Themed label: **Kindred** · plain subtitle: **Same story, several feeds**.

## Problem
When five feeds report one launch, the reader sees five near-identical items and wastes time.

## Acceptance criteria (EARS)
1. WHEN new items are ingested THE SYSTEM SHALL compare them with the user's items from the last 48 hours
   in *other* feeds and group items whose titles are similar (Jaccard ≥ 0.3 on title shingles).
2. THE SYSTEM SHALL never group two items from the same feed.
3. THE SYSTEM SHALL give every group a stable `kindredId` and store it on each member item.
4. WHEN a user opens a grouped item THE SYSTEM SHALL show "Also reported by N feeds" with links to the others.
5. THE MCP tool `list_kindred` SHALL return the user's recent groups (no longer always empty).
6. Grouping SHALL read only light index rows (titles), never full article HTML, so it stays within limits.
7. Grouping SHALL be idempotent and per-user (one user's items never join another user's group).
