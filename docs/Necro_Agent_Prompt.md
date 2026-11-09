# Necro: Prompt for the Build Agent (Kiro)

**How to use:** open an empty folder in **Kiro**, put these three files in a `docs/` folder at the project root, and paste everything below the line into Kiro's agent chat. Keep the files in the repo; they are the source of truth.

- `docs/Necro_Project_Documentation.md`
- `docs/Necro_Brand_Guide.md`
- `docs/Necro_Brand_Assets/` (unzipped)

Work through it **phase by phase**. After each phase, review what was built, run it yourself and only then say "continue". You must understand the code: you will present it in the video and may be asked about it.

---

## PROMPT (copy everything below)

You are the lead engineer building **Necro** ("RSS, resurrected with AI") for the **Kiroween 2026** hackathon, category **Resurrection**. I am Mowlid, the founder. We build it together in Kiro using **spec-driven development**, and judges will score how well we use Kiro, so use Kiro's features deliberately and visibly.

### Sources of truth
1. `docs/Necro_Project_Documentation.md`: product, features, architecture, data model, AI, MCP, security, testing, plan. Follow it.
2. `docs/Necro_Brand_Guide.md`: colours, fonts, motion, voice, naming. Follow it exactly.
3. `docs/Necro_Brand_Assets/`: logos, favicons, fonts, social images. Copy what the app needs into `public/`.

If something is unclear or conflicts, **ask me** instead of guessing. If a library API differs from what the docs say, check the library's current documentation and tell me what changed.

### Hackathon rules you must never break
- All code is written **from now on** (the project must be new, built Oct 30 to Dec 4, 2026). Do not copy code from my older repositories.
- Public **GitHub** repo with an **MIT** `LICENSE` file at the root.
- The **`/.kiro` directory stays at the root and is committed**. Never add `.kiro` or any of its subfolders to `.gitignore`.
- The repo must include everything needed to run the app: code, assets and a clear README with setup steps and `.env.example`.
- No third-party trademarks or logos in the app, images or video (do not use the old Google reader name or logo; say "RSS" or "classic feed readers"). No copyrighted music or sounds.
- Never commit secrets. Real keys live only in `.env.local` and Convex environment variables.

### Git rules
- Commit after each completed task with a clear message (Conventional Commits, e.g. `feat(summon): import OPML`).
- Commits are authored by me. Do not add co-author trailers or AI attribution lines to commits.
- Keep `main` deployable.

### Step 0: Kiro setup (do this first, show me before continuing)
1. Create **steering** files in `.kiro/steering/` (use `inclusion: always` unless noted):
   - `product.md`: what Necro is, users, features, naming table (themed label + plain subtitle), out-of-scope list.
   - `tech.md`: stack and versions from the documentation (Bun, Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui, Motion, Convex, Clerk, Vercel AI SDK with Bedrock/OpenAI/Groq switch, fast-xml-parser, sanitize-html, Zod, MCP SDK, Vitest, fast-check, Playwright, convex-test).
   - `structure.md`: folder structure from section 16 of the documentation and naming conventions.
   - `brand.md`: colours, fonts, motion and voice rules from the brand guide (`inclusion: fileMatch` for `app/**`, `components/**`).
   - `security.md`: SSRF rules, sanitising, user isolation, prompt-injection handling, secrets.
   - `ai-prompts.md`: the Séance and Resurrect prompts and Zod schemas.
2. Create these **agent hooks** in Kiro and tell me how each is configured:
   - On save of `**/*.test.ts` → run the related tests.
   - On save of `convex/schema.ts` → update the data model section in `README.md`.
   - On save of `components/**/*.tsx` → check accessibility (labels, contrast tokens, keyboard focus) and report issues.
   - Manual hook "pre-submit check" → lint, typecheck, all tests, verify `.kiro` is not gitignored, verify `LICENSE` exists.
3. Suggest **MCP servers** worth connecting in Kiro for this build (for example documentation lookup or browser testing), explain why, and wait for my OK.
4. Create two **custom agents** if supported: "Feed Doctor" (debugs feed parsing using the fixtures) and "Copy Editor" (writes UI text following `brand.md`).
5. Start `docs/KIRO_LOG.md`: for every phase, write 3 to 6 bullet points about which Kiro features we used, what worked, what did not, and any bug that specs, hooks or property-based tests caught. This becomes the hackathon write-up, so keep it **truthful and specific**.

### Build phases
For **each feature**, create a Kiro **spec** in `.kiro/specs/<feature>/` (`requirements.md` with EARS-style acceptance criteria, `design.md`, `tasks.md`), show it to me for approval, then implement task by task.

**Phase 1: Foundation**
- Scaffold Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui with Bun. Add `LICENSE` (MIT, copyright Mowlid Haibe), `README.md`, `.env.example`.
- Brand: Tailwind theme tokens, `next/font` (Cinzel + Plus Jakarta Sans), favicons and OG image from the assets.
- Convex schema (section 7), Clerk auth, user sync, user-isolation helper used by every function.
- Done when: sign-in works, an empty Graveyard page renders in brand style, `convex-test` proves user A cannot read user B's data.

**Phase 2: Summon + feed engine** (spec: `summon`)
- Safe fetcher with SSRF protection (section 12), feed discovery, RSS 0.9x/1.0/2.0 + Atom parser, normaliser, OPML import.
- **Property-based tests with fast-check**: parser never throws on random or mutated XML; normalised items always have a title or a link; OPML export then import returns the same feeds; SSRF guard rejects every generated private IP.
- Done when: adding a site URL, a feed URL and an OPML file all work with real feeds; all tests pass.

**Phase 3: Graveyard + polling + Crypt** (specs: `graveyard`, `crypt`)
- Convex cron polling with ETag/Last-Modified, backoff and statuses (alive, dormant, broken).
- Tombstone grid with the rise animation (realtime), reduced-motion support.
- Crypt reader: list, reading pane with sanitised HTML, read/unread, star, search.
- Done when: a new item appears live without refresh and rises; reader is keyboard accessible.

**Phase 4: Séance + Resurrect (AI)** (specs: `seance`, `resurrect`)
- `lib/ai.ts` provider switch via `AI_PROVIDER` / `AI_MODEL`. AI runs only in Convex actions.
- Séance: 3-bullet summary + score with Zod-validated output, caching, daily limits.
- Voice profile in Settings. Resurrect: LinkedIn, X, Instagram drafts, editable, character counters, copy, open official share/compose links.
- Treat article content as untrusted (delimit it, ignore instructions inside it).
- Done when: summary and drafts work end to end with my configured provider; limits enforced.

**Phase 5: MCP server** (spec: `mcp-server`)
- `/api/mcp` Streamable HTTP server with the 8 tools in section 10, Bearer API keys (create, show once, hashed, revoke), Zod validation, rate limiting, activity log.
- Write `docs/MCP.md` with the exact steps we tested.
- Done when: I can connect from an MCP client and run the demo prompt successfully.

**Phase 6: Feed Doctor + polish** (spec: `feed-doctor`)
- Broken-feed detection and fix suggestions.
- Landing page, empty/error/loading states with themed copy, fog background, optional sound (off by default), Lighthouse accessibility ≥ 95.
- Playwright end-to-end test: sign in → summon → read → resurrect → copy.
- Deploy to Vercel + Convex production. Seed a demo account with good public feeds.

**Phase 7: Submission pack**
Draft these for me to review and personalise (they must be in my own words before I publish):
- `docs/SUBMISSION.md`: project description, features, how to test (demo login goes only in the private Devpost field).
- `docs/KIRO_WRITEUP.md`: built from `KIRO_LOG.md`, covering IDE/CLI, custom agents, hooks, specs vs vibe coding, steering, MCP, property-based testing, powers.
- `docs/VIDEO_SCRIPT.md`: under 3 minutes (section 19 of the documentation).
- `docs/BLOG_DRAFT.md`: must state it was written for the Kiroween 2026 hackathon.
- `docs/SOCIAL_POST.md`: starts with `#KiroweenHackathon26` and shares what I like about Kiro.
- Run the "pre-submit check" hook and fix everything it reports.

### Quality bar
- TypeScript strict, no `any` without a comment explaining why.
- Every Convex function checks the user. Every external input is validated with Zod.
- Accessible: labels, focus states, contrast from the brand tokens, keyboard navigation.
- Small, readable files. Explain non-obvious code with short comments.
- After each phase, give me: what was built, how to run and test it, what Kiro features were used, and what is next.

Start with **Step 0** now. Do not write application code until I approve the steering files and hooks.
