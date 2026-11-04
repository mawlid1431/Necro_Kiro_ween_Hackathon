# Kiro log

Truthful, specific notes per phase. Source for `docs/KIRO_WRITEUP.md`.

## Step 0: Kiro setup (Nov 3, 2026)

- Wrote six steering files in `.kiro/steering/`: `product`, `tech`, `structure`, `security` (always included) and `brand` + `ai-prompts` (fileMatch, so they only load for UI and AI files).
- Created four agent hooks as `.kiro/hooks/*.kiro.hook`: run related tests on save of `*.test.ts`, sync the README data model on save of `convex/schema.ts`, accessibility review on save of `components/**/*.tsx`, and a manual "Pre-submit check".
- Created two custom agents in `.kiro/agents/`: Feed Doctor (feed parsing debugger) and Copy Editor (brand voice).
- These files were drafted outside the Kiro IDE. **To do:** open the project in Kiro, confirm each hook appears in the Agent Hooks panel and each agent loads, and note here anything that had to change.
- Version drift caught while reading installed docs: Next.js 16 renamed `middleware.ts` to `proxy.ts`, and Clerk 7 removed `<SignedIn>`/`<SignedOut>` in favour of `<Show when="signed-in">`. Both recorded in `tech.md` so the agent stops generating the old APIs.

## Phase 1: Foundation

- (fill in)
