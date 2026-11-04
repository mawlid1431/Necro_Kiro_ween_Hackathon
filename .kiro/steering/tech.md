---
inclusion: always
---

# Tech stack

Installed versions are the source of truth; check `package.json` and the bundled docs before using an API. Library APIs have moved since most training data:

- **Next.js 16**: `middleware.ts` is now `proxy.ts`. Read `node_modules/next/dist/docs/` before writing Next code.
- **Clerk 7 (Core 3)**: `<SignedIn>` / `<SignedOut>` were removed. Use `<Show when="signed-in">` / `<Show when="signed-out">`. `createRouteMatcher` in `proxy.ts` is deprecated: protect routes in layouts (`auth.protect()`, see `app/(app)/layout.tsx`). `ClerkProvider` goes inside `<body>`.
- **Cache components (Next 16)**: reading cookies/headers outside `<Suspense>` blocks prerendering. Keep Clerk's `<Show>` in client components on public pages (`components/layout/HeaderAuth.tsx`).
- **AI SDK v7**: `generateObject` is deprecated. Use `generateText({ output: Output.object({ schema }) })`.
- **Groq models get retired**: `llama-3.3-70b-versatile` is gone. Current default `AI_MODEL=openai/gpt-oss-120b`; list options with `bunx convex run ai:listGroqModels`, check with `bunx convex run ai:healthCheck`.

| Layer | Choice |
|---|---|
| Runtime / package manager | **Bun only** (`bun install`, `bun add`, `bun run`, `bunx`). Never npm, yarn or pnpm |
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (`@theme` tokens in `app/globals.css`), shadcn/ui |
| Animation | Motion (`motion/react`), always with reduced-motion support |
| Backend / DB | Convex: queries, mutations, actions, crons, realtime |
| Auth | Clerk (`@clerk/nextjs`) + `convex/react-clerk` |
| AI | Vercel AI SDK (`ai`) with provider switch in `lib/ai.ts`: Bedrock (default), OpenAI, Groq via `AI_PROVIDER` / `AI_MODEL` |
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
| `bun run dev` | Next dev server |
| `bunx convex dev` | Convex dev deployment + codegen (run in a second terminal) |
| `bun run lint` / `bun run typecheck` | ESLint / `tsc --noEmit` |
| `bun run test` | Vitest (unit, PBT, convex-test) |
| `bun run check` | lint + typecheck + test |
