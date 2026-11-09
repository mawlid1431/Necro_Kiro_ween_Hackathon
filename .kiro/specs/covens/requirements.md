# Covens — requirements

Themed label: **Covens** · plain subtitle: **Shared feed collections**. Page: **Discover** · *Find collections to follow*.

## Problem
New users start with an empty graveyard and do not know which feeds exist. Experts already know the
best sources for their field but have no way to hand them over. Each user ends up curating alone.

## User stories
1. As a new user, I want to browse collections by topic so my graveyard fills in seconds.
2. As a curator (lecturer, engineer, marketer), I want to publish a set of my feeds so others can follow it.
3. As a follower, I want to know when a collection I follow gains new feeds.
4. As anyone, I want shared lists to never expose what I privately read.

## Acceptance criteria (EARS)
1. WHEN a signed-in user publishes a collection THE SYSTEM SHALL store a snapshot of the chosen feeds
   (URL, title, site) together with a title (3–80 chars), description (≤ 280), topic and visibility.
2. THE SYSTEM SHALL only allow feeds the user owns to be added to their collection.
3. WHEN visibility is `public` THE SYSTEM SHALL list the collection in Discover; WHEN `unlisted`
   THE SYSTEM SHALL show it only to people with its link.
4. THE SYSTEM SHALL show a curator's display name (or "A Necro reader"), never their email, read state,
   stars, Séances, drafts, voice profile or Omens.
5. WHEN a user chooses "Summon all" THE SYSTEM SHALL add every feed they do not already follow, respecting
   the 300-feed cap, and report `{ created, duplicates, skipped }` without waiting for 50 fetches.
6. WHEN a user follows a collection THE SYSTEM SHALL count the follow once and show how many of its
   feeds the user does not have yet.
7. THE SYSTEM SHALL compute trending feeds and follower counts only from public collections.
8. WHEN a collection receives 3 reports from different users THE SYSTEM SHALL hide it from Discover.
9. THE SYSTEM SHALL limit each user to 10 collections, 50 feeds per collection, 10 publishes per hour.
10. THE SYSTEM SHALL serve each public or unlisted collection as OPML at a stable URL.
11. WHEN the curator enables it THE SYSTEM SHALL serve an RSS feed of the curator's starred posts.
12. Every feed URL in a collection SHALL pass the SSRF URL check before it is stored or fetched.
