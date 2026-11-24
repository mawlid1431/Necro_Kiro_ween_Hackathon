# Necro — Devpost submission text

Paste the sections below into the Devpost form. Fields marked **(you)** need your own input.

## Final checklist (official Kiroween 2026 rules)

**Deadline: Dec 4, 2026, 2:00 PM Pacific = Dec 5, 6:00 AM Malaysia. No extensions.**

| # | Item | Who | File / where |
|---|---|---|---|
| 1 | Working app at a public URL | done | https://necro.malitos.tech (deploy the latest code first) |
| 2 | Public GitHub repo, MIT licence visible in About | done | checked Nov 22 |
| 3 | `/.kiro` at the root, not gitignored | done | pre-submit check passes |
| 4 | Text description of features | done | this file |
| 5 | Kiro write-up | done (Kiro IDE checked Nov 24) | `docs/KIRO_WRITEUP.md` |
| 6 | Demo video < 3 min, public on YouTube, no third-party logos or music | video done (2:29.5, `brag-output/brag.mp4`); **you** upload it | `brag-output/share-copy.txt` |
| 7 | Test account + instructions in the **private** Devpost field | **you** | "Testing instructions" below |
| 8 | Category: Resurrection; bonus categories ticked | **you** | top of this file |
| 9 | Blog post (dev.to/Hashnode), says "Kiroween 2026 hackathon" | **you** publish | `docs/BLOG_DRAFT.md` |
| 10 | Social post starting with `#KiroweenHackathon26` | **you** post on LinkedIn as barkulanhub (in your own words), send the link | `docs/SOCIAL_POST.md` (prize ticked on Devpost) |
| 11 | Student proof: LinkedIn, student email, year, degree, school | **you** send details (prize ticked on Devpost) | Devpost form |
| 12 | Startup proof: founder confirmation, website, LinkedIn | done on Devpost (Barkulanhub, barkulanhub.com, linkedin.com/company/barkulanhub); **add your personal LinkedIn** | Devpost form |
| 13 | Kiro credits request (optional) | **you** | by **Dec 1, 12:00 PM PT** |
| 14 | Only describe/show what works on submission day (e.g. Connectors needs platform keys) | **you** | "What it does" below |

- **Category:** Resurrection
- **Bonus categories (tick only those you qualify for):** Best Startup Project, Best Student Project (Resurrection), Best Demo, Bonus Blog, Social Blitz
- **Live app:** https://necro.malitos.tech
- **Code:** https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon (MIT)
- **Video:** **(you)** YouTube link, public, under 3:00

---

## Tagline

RSS, resurrected with AI: follow any site, read calmly, understand fast, and share what you learn.

## Inspiration

In 2013 the most popular RSS reader in the world was shut down, and RSS was left for dead. But RSS never really
died: almost every blog, newsroom, podcast and YouTube channel still publishes a feed. What died was a good way
to *use* it. Meanwhile, people who read to create (creators, marketers, students, researchers, founders) are stuck
with algorithmic social feeds, dozens of open tabs, and copy-pasting what they learn into four different apps.

## What it does

Necro brings RSS back with today's technology and closes the loop from **reading** to **sharing**:

- **Summon**: paste a site, a feed link or an old OPML export. Necro finds the feed (RSS, Atom, JSON Feed) and adds it.
- **The Graveyard**: every feed is a tombstone that **rises**, live, when something new is published.
- **The Crypt**: a calm, chronological reader with read/unread, stars, search and read-aloud.
- **Séance**: a three-bullet AI summary and a 0–100 relevance score for each article, based on your interests.
- **Resurrect**: turns an article into posts for LinkedIn, X, Instagram and TikTok **in your own writing voice**, with a
  preview that matches what each platform will show (the article's real link card, or the exact image).
- **Connectors**: connect your own LinkedIn, X, Instagram and TikTok accounts with each platform's official sign-in,
  then post with one click and see the result live. *(Each platform switches on once its developer-app keys are set;
  until then sharing uses copy and the platform's own composer.)* On the live site today, **LinkedIn** direct posting is
  switched on (connect your own account); X, Instagram and TikTok use Copy and the platform's own composer.
- **Witching Hour**: a live calendar and timeline. Schedule posts for later, or press New post to upload your own image,
  let AI write the caption in your voice, pick accounts, and post now or at a time. Connected accounts post on their own;
  the others remind you, with one-tap sharing. The same post can never go out twice.
- **Home**: a live overview of your feeds, posts, connected accounts and tools used today, with a getting-started checklist.
- **Talk to the Dead**: an MCP server, so Kiro or any AI assistant can list, read, summarise and draft from your feeds.
- **Feed Doctor**: explains broken or moved feeds in plain words and suggests a fix.
- **Covens, Omens, Grimoire, Kindred, Second Opinion**: shared feed collections, topic alerts, a weekly newsletter,
  the same story grouped across sources, and a second AI view on an article.
- **The Circle**: follow people. With an opt-in public profile, the posts you actually published through Necro appear
  for your followers, live, each with its RSS source one click from your Graveyard. Never drafts, reading or your email.
- **Images and topics**: each article keeps its lead image and gets one topic you can filter the Crypt by.
- **Honest AI labels**: every AI answer says which model and provider wrote it, or "Written without AI".
- **Learning memory**: Necro learns you from what you post, draft, star and summarise, adds it to the AI as context,
  and shows exactly what it learned in Settings, with off and reset.

## How we built it

- **Next.js 16** (App Router, TypeScript), **Tailwind v4**, **shadcn/ui**, **Motion** on **Vercel**.
- **Convex** for the database, realtime updates (tombstones rise live), crons for feed polling, and Node actions.
- **Clerk** for sign-in. **Vercel AI SDK** with a provider "ladder" (Groq, Gemini, OpenRouter) and a privacy filter that
  never sends your voice samples to providers that may train on prompts.
- Security first: an SSRF-safe fetcher that checks IPs at socket connect, sanitised article HTML, prompt-injection
  delimiting, per-user isolation tests, hashed MCP keys, encrypted social tokens.
- **Kiro (IDE)**: seven steering docs, four agent hooks (tests on save, schema-to-README, accessibility review,
  pre-submit check), two custom agents (Feed Doctor, Copy Editor), EARS specs with design and task lists, and
  property-based tests. The core and six advanced features were built spec-first in Kiro (Nov 4-9). Later features
  (direct posting, Witching Hour, the Dashboard, the Circle, learning memory and the last quality pass) were built with
  Claude Code under the same steering rules; `docs/KIRO_WRITEUP.md` and `docs/KIRO_LOG.md` say which tool did what.
  What surprised us: writing EARS criteria in Kiro surfaced gaps before any code existed.

## Challenges we ran into

- **Fetching any URL safely.** A feed reader fetches whatever users paste, which is a classic SSRF hole. Checking the
  IP before the request is not enough (DNS rebinding), so private and reserved addresses are blocked at the moment
  the socket connects, and every redirect is checked again. Property-based tests generate private IPs, including
  their IPv6-mapped form.
- **Real feeds are messy.** RSS 0.9x/1.0/2.0, Atom and JSON Feed, missing guids, broken dates and HTML everywhere.
  The parser is property-tested so it never crashes and every item still gets a guid and a title.
- **AI on free tiers.** A provider "ladder" with budgets and a circuit breaker keeps Séance working when one provider
  is rate-limited, and a privacy filter never sends voice samples to providers that may train on prompts.
- **Fast-moving frameworks.** Next.js 16 renamed `middleware.ts` to `proxy.ts` and Clerk 7 changed its components;
  we recorded these in Kiro steering so the agent stopped generating old APIs.
- **"The preview must be the post."** Social platforms build link cards from the article's own tags, so Necro reads the
  same tags, and the preview, the copy button and the post all use one string.

## Accomplishments that we're proud of

- The whole loop works on the live site: follow → rise live → read → summary → posts in your voice → share.
- **262 automated backend tests** in 30 files, including property-based tests and per-user isolation tests.
- An **MCP server**, so any AI assistant (including Kiro) can work with your own reading list.
- Privacy by design: hashed API keys, encrypted social tokens, no tracking, and voice samples kept away from
  providers that train on prompts.

## What we learned

- Writing rules down (steering) beats repeating them in prompts: the agent stays on the stack, the security rules
  and the brand voice.
- EARS acceptance criteria ("WHEN … THE SYSTEM SHALL …") turn straight into tests.
- Property-based testing finds the inputs you would never write by hand.

## What's next for Necro

Next:
Meta and TikTok app reviews so everyone can post directly, scheduled posts, and the daily "What rose last night" digest.

---

## Testing instructions (private field on Devpost)

1. Open https://necro.malitos.tech and sign in with the test account: **(you: create a test account; put the
   email and password only in Devpost's private field, never in the repo)**.
2. Graveyard → **Summon feed** → paste `https://github.blog/feed/` (or any blog). The tombstone fills with posts.
3. Crypt → open an article → read the **Séance** summary.
4. Click **Resurrect** → switch between LinkedIn, X, Instagram and TikTok and compare the previews.
5. Settings → **MCP keys** → create a key and follow `docs/MCP.md` to connect an AI assistant.
6. **Settings → Connected accounts**: LinkedIn direct posting is live (connect your own LinkedIn); X, Instagram and
   TikTok share through Copy and the platform's own composer.
7. **Witching Hour** → **New post**: upload any photo, press **Write with AI**, tick an account, choose **Schedule** in a few
   minutes. Watch it appear in the calendar and on the **Dashboard** without reloading; at that time a
   reminder turns "Time to post" with a badge in the nav.
8. Try to schedule the same post again: Necro refuses it ("Already scheduled…"). Cancel it and you can schedule it again.
9. **Circle** → **People**: follow a demo person (names end in "(demo)") and open **Following**. In Settings you can turn
   on your own public profile; **What Necro learned** shows what Necro picked up from your stars and posts.

## Pre-existing code and assets (disclosure)

**(you: confirm)** No pre-existing project code. Standard open-source frameworks and libraries only (listed in
`frontend/package.json` and `backend/package.json`). Fonts: Cinzel and Plus Jakarta Sans (SIL OFL).
