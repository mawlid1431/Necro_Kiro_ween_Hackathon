## Inspiration

In 2013 the most popular RSS reader in the world was shut down, and RSS was left for dead. But RSS never really died: almost every blog, newsroom, podcast and YouTube channel still publishes a feed. What died was a good way to *use* it.

Meanwhile, people who **read to create** (students, marketers, founders, researchers) follow dozens of sources through feeds ranked by an algorithm, keep twenty tabs open, and copy-paste what they learn into different apps. Most of it never gets shared.

## What it does

Necro brings RSS back with today's technology and closes the loop from **reading** to **sharing**:

- **Summon**: paste a site, a feed link or an old OPML export. Necro finds the feed (RSS, Atom, JSON Feed) and adds it.
- **The Graveyard**: every feed is a tombstone that **rises**, live, when something new is published.
- **The Crypt**: a calm, chronological reader with read/unread, stars, search and read-aloud.
- **Séance**: a three-point AI summary and a 0–100 relevance score for each article, based on your interests.
- **Resurrect**: turns an article into posts for LinkedIn, X and Instagram **in your own writing voice**. Share by copying, or open the platform's own composer with the text ready.
- **Talk to the Dead**: an MCP server, so Kiro or any AI assistant can list, read, summarise and draft from your feeds.
- **Feed Doctor**: explains broken or moved feeds in plain words and suggests a fix.
- **Covens, Omens, Grimoire, Kindred, Second Opinion**: shared feed collections, topic alerts, a weekly newsletter, the same story grouped across sources, and a second AI view on an article.

## How we built it

- **Next.js 16** (App Router, TypeScript), **Tailwind v4**, **shadcn/ui** and **Motion**, hosted on **Vercel**.
- **Convex** for the database, realtime updates (tombstones rise live), scheduled feed polling and server actions.
- **Clerk** for sign-in. **Vercel AI SDK** with a provider "ladder" (Groq, Gemini, OpenRouter), budgets and a circuit breaker, plus a privacy filter that never sends your voice samples to providers that may train on prompts.
- **Kiro**: steering docs (product, tech, structure, security, brand, AI prompts), agent hooks (run related tests, sync the data model to the README, accessibility review, pre-submit check), two custom agents (Feed Doctor, Copy Editor), EARS-style specs for the advanced features, and property-based tests. We also used Claude Code for part of the build; the repository's `docs/KIRO_WRITEUP.md` explains what was built with which tool.

## Challenges we ran into

- **Fetching any URL safely.** A feed reader fetches whatever users paste, a classic SSRF risk. Private and reserved addresses are blocked at the moment the socket connects (so DNS rebinding fails), and every redirect is checked again. Property-based tests generate private IPs, including their IPv6-mapped form.
- **Real feeds are messy.** RSS 0.9x/1.0/2.0, Atom and JSON Feed, missing guids, broken dates. The parser is property-tested so it never crashes and every item still gets a guid and a title.
- **AI on free tiers.** The provider ladder keeps Séance working when one provider is rate-limited.
- **Fast-moving frameworks.** Next.js 16 renamed `middleware.ts` to `proxy.ts` and Clerk 7 changed its components; we recorded this in Kiro steering so the agent stopped generating old APIs.

## Accomplishments that we're proud of

- The whole loop works on the live site: follow → rise live → read → summary → posts in your voice → share.
- 180 automated tests, including property-based tests and per-user isolation tests.
- An MCP server, so your AI assistant can work with your own reading list.
- Privacy by design: hashed API keys, sanitised article HTML, prompt-injection delimiting, no tracking.

## What we learned

- Writing rules down once (steering) beats repeating them in prompts.
- EARS acceptance criteria ("WHEN … THE SYSTEM SHALL …") turn straight into tests.
- Property-based testing finds the inputs you would never write by hand.

## What's next for Necro

Next for Necro: posting directly to your connected social accounts (built, waiting for the platforms' app approvals), scheduled posts, and a daily "What rose last night" digest.