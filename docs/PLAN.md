# Plan: quality pass, AI accuracy and the Circle (follow people)

Date: 2026-11-23 (status updated 2026-11-24). Owner: Mowlid. Status: **done, except the production deploy and the demo video (pending)**.

## Status

| Goal | Status | Where |
|---|---|---|
| G1 Images | done | `backend/lib/feeds/image.ts`, `frontend/components/crypt/media.tsx`, `tests/unit/media-topics.test.ts` |
| G2 Topics | done (Crypt topic filter, Séance refinement, `items.backfillMedia` for older articles) | `backend/lib/topics.ts`, spec `.kiro/specs/media-topics` |
| G3 Honest AI labels | done (Séance, Resurrect, Second Opinion, Grimoire, captions; captions also warn to check the image) | `backend/lib/ai/modelName.ts`, `frontend/components/ui/model-badge.tsx` |
| G4 The Circle | done | `backend/convex/circle.ts`, `/circle`, `/circle/[slug]`, spec `.kiro/specs/circle`, `tests/convex/circle.test.ts` |
| G5 Zero errors | done: dev-only "instant navigation" errors fixed (`export const instant = false` on the signed-in layout); typecheck and lint clean on both apps; 261 backend tests pass in 30 files | `frontend/app/(app)/layout.tsx` |
| G6 Real time verified | done in a browser: a followed person's new post appears at the top of Following without reload; starring 3 articles in one tab updated "What Necro learned" in another; topic reclassification updated the Crypt list live | |
| G7 Docs | done: README, project documentation (Markdown + PDF with diagrams), Devpost story, submission text, Kiro write-up | `docs/` |
| Added: learning memory | done | `backend/lib/ai/learn.ts`, `backend/convex/learning.ts`, Settings › What Necro learned, spec `.kiro/specs/learning` |
| Added: navigation and landing | done: grouped nav with dropdowns, hamburger menu below 1024 px, new landing sections; checked from 320 px to 7680 px | `frontend/components/layout/AppNav.tsx`, `frontend/components/landing/`, `frontend/app/globals.css` |
| Production deploy | **pending** | |
| Demo video | **pending** | `docs/VIDEO_SCRIPT.md` |

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

- **G1 Images** (done): every new article whose feed offers an image stores a safe `https` image URL; the Crypt list and reader show it, with a calm fallback when there is none. Unit tests cover RSS, Atom, Media RSS, enclosure and first-`<img>` cases.
- **G2 Topics** (done): every new article gets one topic from a fixed list (AI, Security, Web & dev, Tech & gadgets, Design, Science, Business, News, Creators, Other). A deterministic classifier (feed categories + title + excerpt) sets it at ingest; the Séance refines it when an AI model answered. The reader can filter by topic. Tests prove the classifier on real-looking headlines.
- **G3 Honest AI labels** (done): every AI output (Séance, Resurrect drafts, captions, Second Opinion, Grimoire) shows a readable model name and provider, or "Written without AI" when Ghost mode answered. The caption action returns the model it used.
- **G4 The Circle (follow people)** (done):
  - Opt-in public profile (off by default): display name, topics, and the posts you already published to LinkedIn/X/Instagram/TikTok through Necro. Never the email, never unpublished drafts, never your reading.
  - Follow / unfollow people. A **Following** stream shows the posts of people you follow, newest first, live.
  - **In your topics**: published posts from public profiles in the topics you care about, so you find new people.
  - **The feed comes with the post**: every shared post links the article and its source feed, with one click to add that feed to your Graveyard.
  - Guards: cannot follow yourself or a private profile, at most 500 follows, rate-limited; turning the profile off hides everything at once.
- **G5 Zero errors** (done): typecheck, lint and all tests pass; the dev-only "instant navigation" errors are gone.
- **G6 Real time verified** (done): see the status table.
- **G7 Docs** (done): README, project documentation, Devpost story and Kiro specs (`.kiro/specs/circle`, `media-topics`, `learning`) describe all of the above; the PDF is regenerated with diagrams: system design, data model, feed-to-post workflow, AI router, the Circle flow and the learning loop.

## 3. How it works (design)

### Images (G1)
`lib/feeds/image.ts` picks the best image per item in this order: `media:content`, `media:thumbnail`, an image `enclosure`, `itunes:image`, JSON Feed `image`, the widest within a source; then the first real `<img>` in the sanitised content. Only `https` (http is upgraded), no `data:` or `javascript:`, no credentials, no tracking pixels. Stored as `items.imageUrl`. Shown with `loading="lazy"`, `referrerPolicy="no-referrer"`, fixed aspect ratio so the layout never jumps, and hidden if it fails to load.

### Topics (G2)
`lib/topics.ts`: a keyword lexicon per topic, whole-word matches, run over feed categories (weight 3), title (2) and excerpt (1). Highest score wins; below a threshold the topic is `other`. The Séance schema gains `topic` (optional); when a real model answered, its topic replaces the keyword guess (`topicBy: "ai" | "keywords"`). The same classifier maps a user's free-text interests to topics, which powers "In your topics".

### Honest labels (G3)
`lib/ai/modelName.ts` turns a spec like `groq:llama-3.3-70b-versatile` into "Llama 3.3 70B · Groq". One `<ModelBadge>` component is used everywhere; `ghost:*` reads "Written without AI".

### The Circle (G4)
Tables:
- `users.profilePublic` (bool, default off), `bio`, `followerCount`, `followingCount`, `sharedCount`, `lastSharedAt` + existing `publicSlug`, `displayName`.
- `follows { followerId, followeeId, createdAt }`, indexes `by_follower`, `by_followee`, `by_pair`.
- `sharedPosts { userId, publishId, platform, text, url, itemTitle?, itemLink?, feedUrl?, feedTitle?, topic, imageUrl?, postedAt }`, indexes `by_user_posted`, `by_topic_posted`, `by_publish`. Written in the same mutation that marks a publish as posted (`finishPublish` / `markShared`), so it is exactly-once, and deleted with the account.

Visibility is checked at read time (`profilePublic`), so turning the profile off hides it instantly for everyone. Queries:
- `circle.following`: for each person I follow (up to 500), their latest posts via `by_user_posted`, merged newest first.
- `circle.inMyTopics`: latest posts per topic of mine via `by_topic_posted`, public authors only, not me, not people I already follow.
- `circle.people`: suggested public profiles ranked by topic overlap and recent posting.
- `circle.profile(slug)`: one public profile and its posts.
UI: a **Circle** item in the nav (`/circle`, tabs Following · In your topics · People), profile pages at `/circle/[slug]`, and a public-profile switch in Settings with a one-line explanation of exactly what becomes visible. Demo people come from `convex/seedCircle.ts`.

### Learning memory (added)
`lib/ai/learn.ts` + `convex/learning.ts`. Necro cannot retrain hosted models, so it learns the reader from their own actions: posted (5), drafted (3), starred (3), summarised (1), with a 30-day half-life. It keeps topic shares, recurring subjects (seen in 2+ articles) and top sources, and sends nothing until there are 3+ actions. The learned line goes into the Séance prompt after the stated interests; real published posts are voice examples for Resurrect when fewer than 3 samples are saved. Refreshed after actions (debounced 10 min) and nightly. Settings › "What Necro learned" shows it, the exact line, on/off and reset.

### What it solves
Readers discover trustworthy sources through people, not ads or algorithms; creators get a small audience inside Necro for what they already post; and every post carries its RSS source, so a good post brings a good feed back to life for someone else. That is the Resurrection theme applied to people.

## 4. Order of work
1. Errors and warnings sweep (P5) so later checks start clean. **Done.**
2. Images and topics in the feed engine (P1, P2) with tests. **Done.**
3. Model labels everywhere (P3). **Done.**
4. The Circle: schema, backend, tests, UI (P4). **Done.**
5. Real-time walk-through in two tabs (G6). **Done.**
6. Docs, Kiro spec, PDF with diagrams (P6). **Done.**
7. Production deploy and demo video. **Pending.**

Out of scope for now: comments and likes, direct messages, blocking (the profile switch and unfollow cover privacy for launch), push notifications for new followers.
