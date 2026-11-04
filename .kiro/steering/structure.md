---
inclusion: always
---

# Project structure

```
necro/
├─ .kiro/            specs/<feature>/{requirements,design,tasks}.md · steering/ · hooks/ · agents/
├─ app/
│  ├─ page.tsx       landing (/)
│  ├─ graveyard/ · crypt/ · doctor/ · settings/
│  ├─ sign-in/[[...sign-in]]/ · sign-up/[[...sign-up]]/
│  └─ api/mcp/route.ts
├─ components/
│  ├─ brand/         Logo, FogBackground
│  ├─ layout/        AppHeader, PageTitle
│  ├─ graveyard/ · crypt/ · resurrect/
│  ├─ providers/     ConvexClientProvider
│  └─ ui/            shadcn primitives + shared building blocks (Button, Card, Tombstone)
├─ convex/           schema.ts · users.ts · graves.ts · items.ts · seance.ts · resurrect.ts · crons.ts · fetcher.ts
│  └─ lib/auth.ts    the user-isolation helper every function uses
├─ lib/              ai.ts · feeds/{parse,discover,opml,normalize}.ts · security/ssrf.ts · sanitize.ts · utils.ts · motion.ts · copy.ts
├─ public/           brand assets copied from docs/Necro_Brand_Assets
├─ tests/            unit/ · pbt/ · e2e/ · fixtures/feeds/
├─ docs/             project docs, brand guide, KIRO_LOG.md
└─ LICENSE · README.md · .env.example
```

## Conventions

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- One home per concern: colours/fonts in `app/globals.css` + `app/fonts.ts`, motion presets in `lib/motion.ts`, UI copy and themed labels in `lib/copy.ts`.
- Search before creating a component; extend with variants instead of copying.
- Server Components by default; add `"use client"` only where state, effects or Motion are needed.
- Every Convex table carries `userId` and an index starting with `userId`.
- Commits: Conventional Commits (`feat(summon): import OPML`), one per completed task.
