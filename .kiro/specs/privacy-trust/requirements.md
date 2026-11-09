# Privacy & trust — requirements

## Problem
Readers will only trust an AI reader with their interests, voice and topics if they control where that
data goes and can leave at any time. Judges and users also need proof the main flow keeps working.

## Acceptance criteria (EARS)
1. WHEN Private mode is on THE SYSTEM SHALL use no AI provider that may train on prompts, for every task;
   IF no allowed provider is available THE SYSTEM SHALL answer with Ghost mode.
2. Settings SHALL show Private mode, a public display name, data export, and Delete my account.
3. WHEN the user types DELETE and confirms THE SYSTEM SHALL delete every row they own (including
   collections, follows, Omens, matches, opinions, Grimoires) in batches, then sign them out.
4. Export SHALL download the user's feeds (OPML) and their drafts, Omens, collections and Grimoires (JSON).
5. An automated end-to-end check SHALL exercise the public site, the OPML endpoint and the MCP auth path
   on the live URL, and the backend goal flow SHALL be covered by a convex-test.
