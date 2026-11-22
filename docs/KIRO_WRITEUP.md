# How Kiro was used to build Necro

Written for the Kiroween 2026 "How was Kiro used" field. Everything below points to files in this repository, so a
judge can check each claim. Where another tool was used, it says so.

## Summary

Necro was built **spec-first and rules-first**: before features, we wrote Kiro **steering docs** that encode the
product, stack, structure, security and brand rules; **agent hooks** that test, review and document as we code;
two **custom agents** for the hardest specialist jobs (feed parsing and brand copy); and a **spec per feature** for
the advanced features. **Property-based tests** guard the parser and the network layer. Necro also *is* an **MCP
server**, so Kiro can read your feeds and draft from them.

Honest note: later work, including the Connectors feature (direct posting to LinkedIn, X, Instagram and TikTok),
was built with **Claude Code**. It still follows the same steering rules, has a spec in Kiro's format, and passes
the same Kiro pre-submit hook. See `docs/KIRO_LOG.md`.

## Steering docs — `.kiro/steering/`

| File | Inclusion | What it enforces |
|---|---|---|
| `product.md` | always | What Necro is, the themed names with plain subtitles, the scope |
| `tech.md` | always | Stack and **version drift**: Next.js 16 renamed `middleware.ts` → `proxy.ts`; Clerk 7 replaced `<SignedIn>` with `<Show when="signed-in">` |
| `structure.md` | always | Where code goes (frontend/backend split, one isolation helper) |
| `security.md` | always | SSRF rules, sanitising, user isolation, secrets handling |
| `roadmap.md` | always | Goal and weekly plan to Dec 4 |
| `brand.md` | fileMatch: `frontend/app/**`, `frontend/components/**`, `frontend/lib/copy.ts` | Voice, naming, colours; loads only for UI files |
| `ai-prompts.md` | fileMatch: AI files | Prompt rules (delimiting, no tools for content models, Zod output) |

**Strategy that made the difference:** `fileMatch` inclusion. Brand and AI-prompt rules load only when those files
are open, so the always-on context stays small and focused, and the version-drift notes in `tech.md` stopped the
agent from generating Next.js 15 / Clerk 6 APIs.

## Agent hooks — `.kiro/hooks/`

| Hook | Trigger | Workflow automated |
|---|---|---|
| Run related tests | on save of `**/*.test.ts(x)` | Runs the tests for the file you just changed |
| Sync data model to README | on save of `backend/convex/schema.ts` | Keeps the README's database section in step with the schema |
| Accessibility check | on save of `frontend/components/**/*.tsx` | Reviews the component for labels, contrast, keyboard and reduced motion |
| Pre-submit check | manual | Lint, typecheck, all tests, `.kiro` not ignored, MIT licence, no committed `.env`, `.env.example` present |

The pre-submit hook was run at the end of the build: **all 7 items pass** (180 tests).

## Custom agents — `.kiro/agents/`

- **Feed Doctor** (`feed-doctor.md`, tools: read, write, shell): an RSS 0.9x/1.0/2.0 and Atom specialist that debugs
  discovery and parsing against the fixtures in `backend/tests/fixtures/`. It mirrors the in-app Feed Doctor feature.
- **Copy Editor** (`copy-editor.md`, tools: read, write): writes and reviews UI text in the brand voice from
  `brand.md` and `product.md`, so every themed name keeps a plain-language subtitle.

## Spec-driven development — `.kiro/specs/`

Each spec has `requirements.md` (user stories + **EARS** acceptance criteria), `design.md` and `tasks.md`:
`covens`, `omens`, `grimoire`, `kindred`, `second-opinion`, `privacy-trust`, `connectors`.

Example (Covens, criterion 4): *"THE SYSTEM SHALL show a curator's display name …, never their email, read state,
stars, Séances, drafts, voice profile or Omens."* That one sentence became the shape of the public query and an
isolation test (`backend/tests/convex/covens.test.ts`), so the privacy rule is enforced in code, not just intended.

**Compared with vibe coding:** EARS criteria give every requirement a testable "WHEN … THE SYSTEM SHALL", so the
tasks list maps straight onto tests, and features stopped "almost working".

## Property-based testing — `backend/tests/pbt/properties.test.ts` (fast-check)

| Property | Why unit tests were not enough |
|---|---|
| The feed parser never throws anything but `FeedParseError` on arbitrary input | Real feeds are malformed in endless ways; hand-written cases can't cover them |
| Every parsed item has a guid and a title, whatever the fields contain | Items missing links, titles or guids must still be stored and de-duplicated |
| OPML export then import returns the same feeds | Round-trip with any titles, URLs and folders (escaping) |
| Every generated private IPv4 address, and its IPv4-mapped IPv6 form, is blocked | SSRF: the mapped-IPv6 form is the classic bypass |

PBT is also used in the Omens, Grimoire, Opinion and extras unit tests.

## MCP — "Talk to the Dead"

Necro ships an MCP server (`frontend/app/api/mcp`, Streamable HTTP, per-user API keys, 60 calls/min). Connected to
Kiro, it lets the agent list what rose today, read articles, and draft posts from **your own sources**, a workflow
that would otherwise need copy-pasting articles into the chat. Setup: `docs/MCP.md`.

## Kiro IDE / CLI / Web / Crew, and powers

The steering, hooks and agents were drafted first as files (see `docs/KIRO_LOG.md`, Step 0).
**(you: before submitting, open the project in the Kiro IDE, confirm each hook shows in the Agent Hooks panel and
each agent loads, then replace this line with what you saw and which Kiro app(s) you used.)**
No Kiro powers or Kiro Crew app were used.

## What we would do differently

Write the specs for the core features (Summon, Crypt, Séance, Resurrect) in Kiro from day one, as we did for the
later features, and keep one tool per feature so the build history is easier to follow.
