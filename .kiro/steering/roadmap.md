---
inclusion: always
---

# Goal and roadmap (Nov 9 – Dec 4, 2026)

## The goal

Necro helps people who read to create keep up with the open web without drowning in it.
A new user signs up, fills their graveyard in seconds, reads, gets a Séance, resurrects a post,
connects an MCP client — in under five minutes, on the live site, with no errors.

**The problem we solve, in four parts:**
1. *"I don't know which feeds to follow."* → **Covens** (shared collections + Discover)
2. *"The same story shows up five times."* → **Kindred** (group one story across feeds)
3. *"Tell me when my topic appears, I can't read everything."* → **Omens** (topic watch + alerts)
4. *"I want to share what I read, fast and in my voice."* → Resurrect, **Second Opinion**, **Grimoire**

## Principles for every feature

- One pipeline: every new item flows through understand → watch → compare → publish.
- Works without AI: every AI step has a deterministic fallback (Ghost mode). Users never see an AI error.
- Private by default: anything about the user (topics, voice, drafts) is a **private** AI task and never
  reaches providers that may train on prompts. Public data is only what the user explicitly publishes.
- Isolation: every new table has `userId` (or is public-by-design) and a convex-test proving one user
  cannot read another user's rows.
- Bounded and idempotent: indexes + `take`/`paginate`, daily limits per feature, safe to retry.
- Brand: light theme tokens, themed label + plain subtitle, `frontend/lib/copy.ts` for all text.

## Phases (each task has a spec in `.kiro/specs/<name>/`)

| Phase | Task | Spec | Outcome |
|---|---|---|---|
| 1 · Community & foundation | T1 | `covens` | Publish and discover feed collections, one-click subscribe |
| | T2 | `kindred` | Stories grouped across feeds, badge in the reader, MCP `list_kindred` real |
| 2 · Intelligence | T3 | `omens` | Topic watches with AI-confirmed matches and in-app alerts |
| | T4 | `second-opinion` | Side-by-side comparison when several feeds cover one story |
| 3 · Create & trust | T5 | `grimoire` | Weekly newsletter draft in the user's voice |
| | T6 | `privacy-trust` | Private mode, delete account, end-to-end test of the goal flow |

Definition of done for a task: spec tasks ticked, backend tests green, frontend lint/typecheck/build green,
deployed to Convex dev + prod, verified on necro.malitos.tech.
