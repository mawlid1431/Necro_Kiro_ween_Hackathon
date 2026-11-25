# Kiro log

Truthful, specific notes per phase. Source for `docs/KIRO_WRITEUP.md`.

## Step 0: Kiro setup (Nov 3, 2026)

- Wrote six steering files in `.kiro/steering/`: `product`, `tech`, `structure`, `security` (always included) and `brand` + `ai-prompts` (fileMatch, so they only load for UI and AI files).
- Created four agent hooks as `.kiro/hooks/*.kiro.hook`: run related tests on save of `*.test.ts`, sync the README data model on save of `convex/schema.ts`, accessibility review on save of `components/**/*.tsx`, and a manual "Pre-submit check".
- Created two custom agents in `.kiro/agents/`: Feed Doctor (feed parsing debugger) and Copy Editor (brand voice).
- These files were drafted outside the Kiro IDE, then checked in it: all four hooks appear in the Agent Hooks panel and both custom agents load (confirmed by the owner, Nov 24, 2026).
- Version drift caught while reading installed docs: Next.js 16 renamed `middleware.ts` to `proxy.ts`, and Clerk 7 removed `<SignedIn>`/`<SignedOut>` in favour of `<Show when="signed-in">`. Both recorded in `tech.md` so the agent stops generating the old APIs.

## Phase 1: Foundation (Nov 4-9, 2026)

From the git history:
- Nov 4: first working code, the users table and the README architecture diagrams.
- Nov 8: the repository split into `frontend/` and `backend/`, and the core Convex backend (feeds, items, polling).
- Nov 9: the AI degradation ladder (circuit breakers, budgets, privacy routing, Ghost mode), the "Talk to the Dead"
  MCP server with 11 tools, the seed script and Feed Doctor fixes.
- Nov 9: the roadmap steering file and **six feature specs** (requirements, design, tasks) written in Kiro, then built
  the same day: Covens, Kindred, Omens, Second Opinion, Grimoire, and Privacy (Private mode, export, delete account).

## Connectors (Nov 22, 2026) — built with Claude Code, not Kiro

- Built outside Kiro with **Claude Code**: direct posting to LinkedIn, X, Instagram and TikTok (official OAuth + posting APIs),
  a preview that uses the exact post text and the article's real link card, a compact menu on small screens, and the
  Next.js 16.4.4 → 16.4.6 security patch (the build refused to run on 16.4.4).
- Kept to the project's Kiro conventions: a spec in `.kiro/specs/connectors/`, steering rules (security, brand voice),
  and the pre-submit check (all items pass).
- Recorded here so the Kiro write-up is accurate about which tool did what.

## Witching Hour, Home and "one post, once" (Nov 22–23, 2026) — built with Claude Code, not Kiro

- Built outside Kiro with **Claude Code**: Witching Hour (live calendar and timeline, scheduling from Resurrect,
  reminders with one-tap sharing), the composer (upload your own image, AI caption from a vision model in your voice,
  pick accounts, post now or schedule), the Home dashboard (logo and sign-in land there), duplicate-post protection
  (content keys checked inside the creating transaction and again before sending; a sweep for stuck posts), the
  compact menu and 6-link nav with tabs, Privacy and Terms pages, and the landing-page phone mockups.
- Kept to the project's conventions: steering rules (security, brand voice), the same isolation pattern
  (`requireUser` + owner checks), and tests (207 passing, including duplicate, isolation and real-time cases).

## Last quality pass (Nov 23-24, 2026) — built with Claude Code, not Kiro

- Built outside Kiro with **Claude Code**: article images and topics, plain AI model labels on every AI output, the
  Circle (follow people, opt-in public profiles), the learning memory, the grouped navigation and phone menu,
  large-screen scaling, the landing page sections, the docs and PDF diagrams, and the demo video.
- Specs for this work (`circle`, `learning`, `media-topics`) were written with Claude Code alongside the code, in the
  project's spec format, and completed afterwards.
- Two bugs found in live checks and fixed: an optional field made Groq's strict structured output reject every
  Séance (answers fell back to Ghost mode), and the learning refresh could skip recent actions. Both have tests.
- Tests: 262 passing in 30 files; typecheck and lint clean.

## Dashboard, Docs and dark mode (Nov 25, 2026) — built with Claude Code, not Kiro

- Built outside Kiro with **Claude Code**: the Home activity chart (one metric at a time, 14 days, change vs last
  week) and the "MCP keys & usage" card with per-day MCP call counts (new `mcpUsage` table); deleting revoked MCP
  keys; the public **Docs** page (`/docs`) with copyable setup for Kiro, Claude Code, Claude, Cursor, ChatGPT and
  VS Code plus a prompt that lets a coding agent set itself up; light and dark mode with a header toggle; the UI set
  10% smaller; an updated FAQ, How it works, Privacy and Terms; `robots.txt` and `sitemap.xml`.
- Live checks found and fixed: the activity query read full article rows and failed on production (now counts small
  `kindredIndex` rows); a re-render loop on the dashboard; link previews pointing at localhost; class merging that
  dropped text colours next to the custom type scale. Production Convex had not been deployed by the Vercel build
  (no `CONVEX_DEPLOY_KEY`), so the backend was deployed by hand.
- Kept to the project's conventions: steering rules (brand voice, security), copy in `lib/copy.ts`, the isolation
  pattern, and the `schema-to-readme` hook's README section. Tests: 302 passing in 33 files; typecheck, lint and the
  production build clean.
