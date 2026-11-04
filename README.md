# Necro

**RSS, resurrected with AI.** A Kiroween 2026 project (category: Resurrection) by Mowlid Haibe · a Faafi project.

Necro turns your feeds into tombstones that rise when something new is published, gives you a calm reader, summarises articles with AI (Séance), drafts social posts in your voice (Resurrect), and lets Claude talk to your feeds over MCP.

Full product and system design: [`docs/Necro_Project_Documentation.md`](docs/Necro_Project_Documentation.md) · Brand: [`docs/Necro_Brand_Guide.md`](docs/Necro_Brand_Guide.md) · Kiro usage log: [`docs/KIRO_LOG.md`](docs/KIRO_LOG.md)

## Stack

Bun · Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Motion · Convex · Clerk · Vercel AI SDK (Groq, OpenAI or Bedrock) · Zod · Vitest + convex-test

## Setup

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
cp .env.example .env.local
```

1. **Convex:** run `bunx convex dev` once. It links or creates a project and writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`.
2. **Clerk:** create an application, copy the publishable and secret keys into `.env.local`, set `CLERK_JWT_ISSUER_DOMAIN` to its Frontend API URL, and turn on the **Convex** integration in the Clerk dashboard.
3. **Convex environment variables** (dashboard or CLI):

   ```bash
   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   bunx convex env set AI_PROVIDER groq
   bunx convex env set AI_MODEL openai/gpt-oss-120b
   bunx convex env set GROQ_API_KEY <your-key>
   ```

4. Check the AI provider works: `bunx convex run ai:healthCheck`.

## Run

```bash
bunx convex dev   # terminal 1: Convex backend + codegen
bun run dev       # terminal 2: http://localhost:3000
```

## Scripts

| Command | Does |
|---|---|
| `bun run dev` | Next.js dev server |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest (unit, property-based, convex-test) |
| `bun run check` | lint + typecheck + test |

## Data model

<!-- data-model:start -->
| Table | Key fields | Indexes |
|---|---|---|
| `users` | tokenIdentifier, clerkId, name, email, interests[], createdAt | by_token |
| `graves` | userId, feedUrl, siteUrl, title, iconUrl, status, etag, lastModified, lastFetchedAt, nextFetchAt, errorCount, lastError | by_user, by_user_feedUrl, by_nextFetchAt |
| `items` | userId, graveId, guid, title, link, author, publishedAt, contentHtml, excerpt, isRead, isStarred, risenAt | by_user_risenAt, by_grave_guid, by_user_grave |
| `seances` | userId, itemId, summary[3], score, reason, model, createdAt | by_user, by_item |
| `drafts` | userId, itemId, platform, text, hashtags[], status, updatedAt | by_user, by_user_item |
| `voice` | userId, tone, audience, wordsToUse[], wordsToAvoid[], samplePosts[] | by_user |
| `apiKeys` | userId, name, hashedKey, prefix, lastUsedAt, revokedAt | by_user, by_hashedKey |
<!-- data-model:end -->

Every table except `users` is scoped by `userId`; `convex/lib/auth.ts` is the one isolation helper, and `tests/convex/isolation.test.ts` proves one user cannot read another's data.

## Kiro

Specs, steering, hooks and custom agents live in [`.kiro/`](.kiro) and are committed on purpose.

## License

[MIT](LICENSE) © 2026 Mowlid Haibe
