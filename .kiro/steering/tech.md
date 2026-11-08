---
inclusion: always
---

# Tech stack

Installed versions are the source of truth; check `package.json` and the bundled docs before using an API. Library APIs have moved since most training data:

- **Next.js 16**: `middleware.ts` is now `proxy.ts`. Read `node_modules/next/dist/docs/` before writing Next code.
- **Clerk 7 (Core 3)**: `<SignedIn>` / `<SignedOut>` were removed. Use `<Show when="signed-in">` / `<Show when="signed-out">`. `createRouteMatcher` in `proxy.ts` is deprecated: protect routes in layouts (`auth.protect()`, see `app/(app)/layout.tsx`). `ClerkProvider` goes inside `<body>`.
- **Cache components (Next 16)**: reading cookies/headers outside `<Suspense>` blocks prerendering. Keep Clerk's `<Show>` in client components on public pages (`components/layout/HeaderAuth.tsx`).
- **AI SDK v7**: `generateObject` is deprecated. Use `generateText({ output: Output.object({ schema }) })`.
- **Models get retired**: `llama-3.3-70b-versatile` is gone. Never hard-code a model id: each task reads a chain `AI_CHAIN_<TASK>=provider:id,provider:id,...` (groq, google, openrouter). Check them with `bunx convex run aiNode:healthCheck` and `bunx convex run admin:health` (in `backend/`).
- **AI ladder (Final Draft §7–8)**: every model call goes through `runWithLadder` (`backend/lib/ai/router.ts`, Convex glue in `backend/convex/lib/ladder.ts`): circuit breakers and provider budgets skip a rung without calling it, Zod + one repair per rung, then Ghost mode (`backend/lib/ai/ghost.ts`) so users never see an AI error. Private tasks (resurrect, ask) never use rungs flagged `trainsOnPrompts` — enforced in code.

| Layer | Choice |
|---|---|
| Runtime / package manager | **Bun only** (`bun install`, `bun add`, `bun run`, `bunx`). Never npm, yarn or pnpm |
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (`@theme` tokens in `app/globals.css`), shadcn/ui |
| Animation | Motion (`motion/react`), always with reduced-motion support |
| Backend / DB | Convex: queries, mutations, actions, crons, realtime |
| Auth | Clerk (`@clerk/nextjs`) + `convex/react-clerk` |
| AI | Vercel AI SDK (`ai`) in `backend/lib/ai/`: Groq, Gemini and OpenRouter rungs per task, degradation ladder ending in Ghost mode |
| Feeds | fast-xml-parser + own normaliser (RSS 0.9x/1.0/2.0, Atom 1.0) |
| HTML safety | sanitize-html |
| Validation | Zod v4 for every external input, AI output and MCP argument |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP at `/api/mcp` |
| Icons | lucide-react, 1.75 stroke, 20 px |
| Tests | Vitest, fast-check (property-based), convex-test, Playwright |
| Hosting | Vercel + Convex Cloud |

## Rules

- All business logic lives in Convex functions. UI and the MCP route call the same functions.
- Network fetching only in Convex **actions**, through the one safe fetcher.
- AI calls only in Convex actions; keys live in Convex env vars, never `NEXT_PUBLIC_*`.
- No `any` without a comment explaining why.

## Scripts

| Command | Does |
|---|---|
| `frontend/: bun run dev` | Next dev server |
| `backend/: bun run dev` | `convex dev`: dev deployment + codegen (second terminal) |
| `frontend/: bun run check` | ESLint + `tsc --noEmit` |
| `backend/: bun run test` | Vitest (unit, PBT, convex-test) |
| `backend/: bun run check` | typecheck + test |
| `backend/: bun run env:push` | Push `backend/.env.local` secrets to Convex env |
