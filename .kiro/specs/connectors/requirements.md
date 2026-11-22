# Connectors — requirements

> **How this spec was made (disclosure).** Connectors, the compact menu and the exact-match preview were planned and built
> on Nov 22, 2026 with **Claude Code** (Anthropic), not in Kiro. The plan (`docs/specs/connectors.md`) was written before
> the code; this spec was written in Kiro's format at the same time so the feature follows the project's conventions.

Themed label: **Connectors** · plain subtitle: **Link your LinkedIn, X, Instagram and TikTok to post straight from Resurrect**.

## Problem
Resurrect wrote good drafts, but sharing them was manual: copy the text, open each platform, paste, find an
image, check that it looked right. The preview was an approximation (a made-up link card, an Instagram image
the user did not have), so what appeared on the platform was not what Necro showed. People who read to create
(creators, marketers, students, researchers) post to several networks; each extra step loses posts.

## User stories
1. As a creator, I want to connect my own LinkedIn, X, Instagram and TikTok accounts once, so I can post from Necro.
2. As a creator, I want the preview to be exactly what will appear on each platform, including the link card or image.
3. As a creator, I want to press one button and see, live, whether the post went out, with a link to it.
4. As anyone, I want Necro to post only when I press the button, and never to see my passwords or read my feed.

## Acceptance criteria (EARS)
1. THE SYSTEM SHALL show a Connectors page, linked from the main navigation, listing LinkedIn, X, Instagram and TikTok
   with Connect / Reconnect / Disconnect, the connected account's name and picture, and whether access renews.
2. WHEN a platform's app keys are not configured on the server THE SYSTEM SHALL show it as "Coming soon" and SHALL NOT
   start a connection.
3. WHEN a user connects a platform THE SYSTEM SHALL use that platform's official OAuth 2.0 flow, with a single-use
   `state` bound to the user and platform that expires after 15 minutes, and PKCE where the platform supports it (X).
4. THE SYSTEM SHALL store access and refresh tokens only encrypted (AES-256-GCM) and SHALL never return them to the browser.
5. WHEN a token expires within 5 minutes of use THE SYSTEM SHALL refresh it where the platform allows (X, TikTok,
   Instagram) and otherwise mark the connection expired and ask the user to reconnect (LinkedIn).
6. THE SYSTEM SHALL build the post text once (`finalPost`) and use that same string for the preview, the character
   counter, the copy button, the share link and the API post.
7. THE SYSTEM SHALL draw link cards in the preview from the article's own Open Graph / Twitter tags, as X and
   LinkedIn do, and SHALL post to LinkedIn with that title, description and image.
8. THE SYSTEM SHALL post Instagram and TikTok with the same 1080×1080 image the preview shows, served as JPEG from a
   signed link valid for one hour.
9. WHEN a user presses Post now THE SYSTEM SHALL record the attempt, show its status live (posting → posted with a
   link, or failed with the platform's message) and mark the draft shared on success.
10. THE SYSTEM SHALL refuse a second Post now for the same article and platform while one is in progress, and SHALL
    limit each user to 30 posts an hour.
11. WHEN posting to TikTok THE SYSTEM SHALL show the creator's name, a privacy choice with no default, the comment
    setting, the commercial-content disclosure and TikTok's music-usage consent, as TikTok's sharing guidelines require.
12. WHEN a user disconnects a platform or deletes their account THE SYSTEM SHALL delete the stored tokens.
13. On screens narrower than `lg` THE SYSTEM SHALL show the navigation as a compact menu button.
