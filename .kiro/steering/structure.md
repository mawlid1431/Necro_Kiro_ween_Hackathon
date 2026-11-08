---
inclusion: always
---

# Project structure

Two apps, each with its own `package.json`, `bun.lock` and `node_modules` (Bun only). Run commands inside the folder.

```
necro/
├─ .kiro/            specs/<feature>/{requirements,design,tasks}.md · steering/ · hooks/ · agents/
├─ frontend/         Next.js app (Vercel)
│  ├─ app/           page.tsx (landing) · (app)/graveyard … · sign-in · sign-up · api/mcp · api/livekit/token
│  ├─ components/    brand/ · layout/ · graveyard/ · providers/ · ui/
│  ├─ lib/           utils.ts · motion.ts · copy.ts · clerk-appearance.ts
│  ├─ public/        brand assets
│  └─ .env.example   NEXT_PUBLIC_* + Clerk + LiveKit + server secrets for the API routes
├─ backend/          Convex (the only backend; UI, MCP and voice all call it)
│  ├─ convex/        schema · users · graves · items · feedsNode ("use node") · aiNode ("use node")
│  │                 seances · drafts · voice · doctor · doctorNode · apiKeys · aiUsage · usage · rateLimits
│  │                 providerHealth (breakers, budgets) · admin (health) · crons
│  │  └─ lib/auth.ts the user-isolation helper every function uses
│  ├─ lib/           ai/{providers,router,breaker,budgets,prompts,ghost,kindred,mock}.ts
│  │                 limits.ts · errors.ts · schedule.ts · sanitize.ts
│  │                 feeds/{parse,jsonfeed,any,normalize,discover,opml,url}.ts · security/ssrf.ts
│  ├─ tests/         unit/ · pbt/ · convex/
│  ├─ scripts/       push-env.ts (bun run env:push)
│  └─ .env.example   AI keys + models + server secrets (pushed to Convex env)
├─ docs/             project docs, brand guide, KIRO_LOG.md
└─ LICENSE · README.md
```

The frontend imports the generated API as `@backend/convex/_generated/api`.

## Conventions

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- One home per concern: colours/fonts in `frontend/app/globals.css` + `frontend/app/fonts.ts`, motion presets in `frontend/lib/motion.ts`, UI copy and themed labels in `frontend/lib/copy.ts`.
- A `"use node"` Convex file may export only actions; keep its queries and mutations in a sibling file.
- Search before creating a component; extend with variants instead of copying.
- Server Components by default; add `"use client"` only where state, effects or Motion are needed.
- Every Convex table carries `userId` and an index starting with `userId`.
- Commits: Conventional Commits (`feat(summon): import OPML`), one per completed task.
