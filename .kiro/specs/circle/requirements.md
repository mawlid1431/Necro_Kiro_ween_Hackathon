# The Circle — requirements

Themed label: **The Circle** · plain subtitle: **Follow people and see what they share**. Page: `/circle` (tabs Following · In your topics · People), profiles at `/circle/[slug]`.

## Problem
Necro was single-player. Readers could follow collections, not people, so good sources only spread through ads and
algorithms, and creators had no audience inside the app for what they already publish.

## User stories
1. As a reader, I want to follow people who read what I read and see what they publish, newest first.
2. As a reader, I want to discover people in my topics, even before I follow anyone.
3. As a creator, I want the posts I already publish through Necro to build a small audience inside it, only if I choose.
4. As anyone, I want a good post to bring its RSS source with it, so I can follow that source too.
5. As anyone, I want nothing about me visible until I opt in, and everything hidden the moment I opt out.

## Acceptance criteria (EARS)
1. THE SYSTEM SHALL keep every profile private by default (`users.profilePublic` unset).
2. WHEN a user turns the profile on THE SYSTEM SHALL require a display name and assign a stable random slug.
3. WHEN a publish becomes `posted` (Post now, scheduled auto-post, or a reminder marked shared) THE SYSTEM SHALL record
   exactly one `sharedPosts` row in the same transaction, even if the finish is retried.
4. THE SYSTEM SHALL never share drafts, failed or scheduled posts, reading history, feeds followed, the email or the Clerk name.
5. THE SYSTEM SHALL share a post's feed URL only when it is a plain public address (no credentials, no query string,
   no token-like path).
6. WHEN a user follows a public profile THE SYSTEM SHALL count it once, refuse self-follows and private profiles,
   cap following at 500 and at 30 follows per minute, and keep follower/following counters exact.
7. THE SYSTEM SHALL show in Following the latest posts of followed public profiles, newest first, live.
8. THE SYSTEM SHALL show in "In your topics" recent posts whose topic matches the reader's stated interests or the
   topics they read most, excluding their own posts and people they already follow.
9. WHEN a profile is turned off THE SYSTEM SHALL hide it and every post from all streams and profile views at once
   (visibility checked on every read); the owner can still preview it.
10. WHEN a user chooses "Add this feed" on a post THE SYSTEM SHALL summon that feed into their Graveyard.
11. WHEN an account is deleted THE SYSTEM SHALL delete its follows in both directions (fixing the other side's counters)
    and its shared posts.
