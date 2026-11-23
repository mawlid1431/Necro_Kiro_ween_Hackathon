# Plan: quality pass, AI accuracy and the Circle (follow people)

Date: 2026-11-23. Owner: Mowlid. Status: in progress.

## 1. What we found (the problems)

| # | Problem | Why it matters |
|---|---|---|
| P1 | Articles carry no image. Feeds publish one (`media:content`, `media:thumbnail`, `enclosure`, first `<img>`), Necro throws it away. | The reader looks like a wall of text; posts made from an article have no picture. |
| P2 | Articles have no topic. Feeds send `<category>`, the Séance knows what the article is about, but nothing stores it. | No way to group, filter or match articles by subject; nothing to match people on. |
| P3 | "Write with AI" for an image does not say which model wrote the caption, and the Séance shows the model only as a tooltip. | Users cannot judge how much to trust an AI answer. Labels must be visible and readable ("Llama 3.3 70B via Groq"), and "no AI" must be said plainly. |
| P4 | Necro is single-player. You can follow *collections*, not *people*, and you never see what like-minded readers share. | No discovery through people, no audience for creators inside the app. |
| P5 | Dev console shows "instant navigation" errors on every page; Convex logs and the build were not swept for warnings since the new deployment. | Errors hide real bugs; judges open the console. |
| P6 | Docs and the PDF predate the dashboard, the duplicate-post guard, the new nav and this work, and the PDF has no diagrams. | Judges read the docs first. |

## 2. Goals (done means all of these are true)

- **G1 Images**: every new article whose feed offers an image stores a safe `https` image URL; the Crypt list and reader show it, with a calm fallback when there is none. Unit tests cover RSS, Atom, Media RSS, enclosure and first-`<img>` cases.
- **G2 Topics**: every new article gets one topic from a fixed list (AI, Security, Dev, Design, Science, Business, News, Creators, Other). A deterministic classifier (feed categories + title + excerpt) sets it at ingest; the Séance refines it when an AI model answered. The reader can filter by topic. Tests prove the classifier on real-looking headlines.
- **G3 Honest AI labels**: every AI output (Séance, Resurrect drafts, captions, Second Opinion, Grimoire, Doctor) shows a readable model name and provider, or "Written without AI" when Ghost mode answered. The caption action returns the model it used.
- **G4 The Circle (follow people)**:
  - Opt-in public profile (off by default): display name, topics, and the posts you already published to LinkedIn/X/Instagram/TikTok through Necro. Never the email, never unpublished drafts, never your reading.
  - Follow / unfollow people. A **Following** stream shows the posts of people you follow, newest first, live.
  - **In your topics**: published posts from public profiles in the topics you care about, so you find new people.
  - **The feed comes with the post**: every shared post links the article and its source feed, with one click to add that feed to your Graveyard.
  - Guards: cannot follow yourself or a private profile, at most 500 follows, rate-limited; turning the profile off hides everything at once.
- **G5 Zero errors**: typecheck, lint, all tests and `next build` pass with no warnings we own; no errors in the browser console on any page; no errors in Convex logs during a full walk-through.
- **G6 Real time verified**: with two browser tabs, following, posting, profile on/off, reading, scheduling and topic changes appear in the other tab without a reload.
- **G7 Docs**: README, project documentation, Devpost story and a new Kiro spec (`.kiro/specs/circle`) describe all of the above; the PDF is regenerated with diagrams: system design, data model, feed-to-post workflow, AI router, and the Circle flow.

## 3. How it works (design)

### Images (G1)
`lib/feeds/image.ts` picks the best image per item in this order: `media:content` (image, largest), `media:thumbnail`, `media:group`, `enclosure` with an image type, `itunes:image`, JSON Feed `image`/`banner_image`, then the first `<img>` in the sanitised content. Only absolute `https` URLs, no `data:`, no tracking pixels (1x1 or `width<=2`). Stored as `items.imageUrl`. Shown with `loading="lazy"`, `referrerPolicy="no-referrer"`, fixed aspect ratio so the layout never jumps, and hidden if it fails to load.

### Topics (G2)
`lib/topics.ts`: a weighted keyword lexicon per topic, run over feed categories (weight 3), title (2) and excerpt (1). Highest score wins; below a threshold the topic is `other`. The Séance schema gains `topic` (enum); when a real model answered, its topic replaces the keyword guess (`topicBy: "ai" | "keywords"`). The same classifier maps a user's free-text interests to topics, which powers "In your topics".

### Honest labels (G3)
`lib/ai/modelName.ts` turns a spec like `groq:llama-3.3-70b-versatile` into "Llama 3.3 70B · Groq". One `<ModelBadge>` component is used everywhere; `ghost:*` reads "Written without AI".

### The Circle (G4)
Tables:
- `users.profilePublic` (bool, default off) + existing `publicSlug`, `displayName`.
- `follows { followerId, followeeId, createdAt }`, indexes `by_follower`, `by_followee`, `by_pair`.
- `sharedPosts { userId, publishId, platform, text, url, itemTitle?, itemLink?, feedUrl?, feedTitle?, topic, imageUrl?, postedAt }`, indexes `by_user_posted`, `by_topic_posted`. Written in the same mutation that marks a publish as posted, so it is exactly-once, and deleted with the account.

Visibility is checked at read time (`profilePublic`), so turning the profile off hides it instantly for everyone. Queries:
- `circle.following`: for each person I follow (up to 500), their latest posts via `by_user_posted`, merged newest first, page of 30.
- `circle.inMyTopics`: latest posts per topic of mine via `by_topic_posted`, public authors only, not me, not people I already follow.
- `circle.people`: suggested public profiles ranked by topic overlap and recent posting.
- `circle.profile(slug)`: one public profile and its posts.
UI: a new **Circle** item in the nav (`/circle`, tabs Following · In your topics · People), profile pages at `/circle/[slug]`, and a "Share my published posts on my profile" switch in Settings with a one-line explanation of exactly what becomes visible.

### What it solves
Readers discover trustworthy sources through people, not ads or algorithms; creators get a small audience inside Necro for what they already post; and every post carries its RSS source, so a good post brings a good feed back to life for someone else. That is the Resurrection theme applied to people.

## 4. Order of work
1. Errors and warnings sweep (P5) so later checks start clean.
2. Images and topics in the feed engine (P1, P2) with tests.
3. Model labels everywhere (P3).
4. The Circle: schema, backend, tests, UI (P4).
5. Real-time walk-through in two tabs (G6).
6. Docs, Kiro spec, PDF with diagrams (P6).

Out of scope for now: comments and likes, direct messages, blocking (the profile switch and unfollow cover privacy for launch), push notifications for new followers.
