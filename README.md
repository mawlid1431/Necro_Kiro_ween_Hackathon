# Necro

**RSS, resurrected with AI.** A Kiroween 2026 project (category: Resurrection) by Mowlid Haibe · a Faafi project.

Necro turns your feeds into tombstones that rise when something new is published, gives you a calm reader, summarises articles with AI (Séance), drafts social posts in your voice (Resurrect), and lets Claude talk to your feeds over MCP.

Full product and system design: [`docs/Necro_Project_Documentation.md`](docs/Necro_Project_Documentation.md) · Brand: [`docs/Necro_Brand_Guide.md`](docs/Necro_Brand_Guide.md) · Kiro usage log: [`docs/KIRO_LOG.md`](docs/KIRO_LOG.md)

## Stack

Bun · Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Motion · Convex · Clerk · Vercel AI SDK (Groq + OpenRouter with fallback) · Zod · Vitest + fast-check + convex-test

## Project layout

Two apps, each with its own `package.json`, `bun.lock` and `node_modules`. Bun only.

```
frontend/   Next.js app (UI, Clerk, /api routes). Deploys to Vercel.
backend/    Convex: schema, queries, mutations, actions, crons
            + lib/ (feed engine, SSRF-safe fetcher, AI layer, prompts) + tests/
docs/       Product docs, brand guide, Kiro log
.kiro/      Kiro steering, hooks and agents
```

The frontend imports the generated Convex API as `@backend/convex/_generated/api`.

**MCP (Talk to the Dead):** `POST /api/mcp` with a personal API key exposes 11 tools over your graveyard. Setup and tool list: [`docs/MCP.md`](docs/MCP.md).

## Setup

Requires [Bun](https://bun.sh) 1.3+.

```bash
cd backend  && bun install && cp .env.example .env.local
cd ../frontend && bun install && cp .env.example .env.local
```

1. **Convex:** in `backend/`, run `bunx convex dev` once. It links the project and writes `CONVEX_DEPLOYMENT`.
2. **Clerk:** copy the publishable and secret keys into `frontend/.env.local`, set `CLERK_JWT_ISSUER_DOMAIN` (both files) to its Frontend API URL, and turn on the **Convex** integration in the Clerk dashboard.
3. **Backend secrets:** fill in `backend/.env.local` (AI keys, models, server secrets), then push them to Convex:

   ```bash
   cd backend && bun run env:push
   ```

4. Check the AI models work: `bunx convex run aiNode:healthCheck`.

## Run

```bash
cd backend  && bun run dev   # terminal 1: Convex backend + codegen
cd frontend && bun run dev   # terminal 2: http://localhost:3000
```

## Scripts

| Folder | Command | Does |
|---|---|---|
| frontend | `bun run dev` / `build` | Next.js dev server / production build |
| frontend | `bun run check` | ESLint + `tsc --noEmit` |
| backend | `bun run dev` | `convex dev` (deploys functions to the dev deployment, regenerates types) |
| backend | `bun run test` | Vitest: unit, property-based (fast-check), convex-test |
| backend | `bun run check` | typecheck + tests |
| backend | `bun run env:push` | Push `backend/.env.local` secrets to Convex (`-- --prod` for production) |

## Architecture & Diagrams

### System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        Claude[Claude Desktop<br/>MCP Client]
    end
    
    subgraph "Next.js 16 App"
        Pages[Pages & Components]
        API[API Routes<br/>/api/mcp]
        Middleware[Proxy.ts<br/>Auth]
    end
    
    subgraph "Convex Backend"
        Queries[Queries<br/>Read Operations]
        Mutations[Mutations<br/>Write Operations]
        Actions[Actions<br/>AI & Network]
        Crons[Cron Jobs<br/>Feed Polling]
        DB[(Convex DB)]
    end
    
    subgraph "External Services"
        Clerk[Clerk Auth]
        AI[AI Providers<br/>Groq/OpenAI/Bedrock]
        Feeds[RSS/Atom Feeds]
    end
    
    Browser -->|HTTPS| Pages
    Claude -->|MCP over HTTP| API
    Pages -->|Convex Client| Queries
    Pages -->|Convex Client| Mutations
    API -->|Convex Client| Queries
    API -->|Convex Client| Actions
    
    Queries <-->|Read| DB
    Mutations <-->|Write| DB
    Actions -->|Fetch| Feeds
    Actions -->|Generate| AI
    Crons -->|Scheduled| Actions
    
    Middleware -->|Verify| Clerk
    Actions -->|User Isolation| Clerk
```

### Application Workflow

```mermaid
flowchart TD
    Start([User Signs In]) --> Dashboard[View Graveyard]
    Dashboard --> AddFeed{Add Feed?}
    
    AddFeed -->|URL| Summon[Summon Feed]
    AddFeed -->|Auto-discover| Discover[Website Discovery]
    AddFeed -->|OPML| Import[Import OPML]
    
    Summon --> Parse[Parse Feed]
    Discover --> Parse
    Import --> Parse
    
    Parse --> Store[Store in graves table]
    Store --> Poll[Cron: Poll Feeds]
    
    Poll --> Fetch[Fetch New Items]
    Fetch --> Items[Store in items table]
    Items --> Rise[Tombstone Rises]
    
    Rise --> Crypt[View in Crypt]
    Crypt --> Read{User Actions}
    
    Read -->|Read Article| Mark[Mark as Read]
    Read -->|Star| Star[Mark as Starred]
    Read -->|AI Summary| Seance[Generate Séance]
    Read -->|Create Post| Resurrect[Generate Drafts]
    
    Seance --> AI1[AI Action:<br/>3-bullet summary<br/>+ relevance score]
    Resurrect --> AI2[AI Action:<br/>LinkedIn, X, Instagram<br/>drafts in user voice]
    
    AI1 --> Display[Display Results]
    AI2 --> Copy[Copy or Share]
    
    Copy --> End([Done])
    Mark --> Crypt
    Star --> Crypt
```

### Activity Diagram - Feed Processing

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    Idle --> Fetching: Cron Trigger<br/>(every 15 min)
    
    Fetching --> Parsing: Feed Downloaded
    Fetching --> Error: Network Failure
    
    Parsing --> Validating: XML Parsed
    Parsing --> Error: Invalid Format
    
    Validating --> Processing: Valid Feed
    Validating --> Error: Schema Mismatch
    
    Processing --> CheckNew: Items Extracted
    
    CheckNew --> StoreItems: New Items Found
    CheckNew --> UpdateMeta: No New Items
    
    StoreItems --> RiseTombstone: Items Saved
    RiseTombstone --> UpdateMeta: UI Updated
    
    UpdateMeta --> Idle: Next fetch scheduled
    
    Error --> IncrementCount: Log Error
    IncrementCount --> Disabled: Count >= 5
    IncrementCount --> Idle: Count < 5
    
    Disabled --> [*]: Feed marked broken
```

### Class Diagram - Core Entities

```mermaid
classDiagram
    class User {
        +Id _id
        +string tokenIdentifier
        +string clerkId
        +string name
        +string email
        +string[] interests
        +number createdAt
    }
    
    class Grave {
        +Id _id
        +Id userId
        +string feedUrl
        +string siteUrl
        +string title
        +string iconUrl
        +string status
        +string etag
        +string lastModified
        +number lastFetchedAt
        +number nextFetchAt
        +number errorCount
        +string lastError
        +list() Query
        +create() Mutation
        +bury() Mutation
    }
    
    class Item {
        +Id _id
        +Id userId
        +Id graveId
        +string guid
        +string title
        +string link
        +string author
        +number publishedAt
        +string contentHtml
        +string excerpt
        +boolean isRead
        +boolean isStarred
        +number risenAt
        +listRisen() Query
        +markRead() Mutation
        +toggleStar() Mutation
    }
    
    class Seance {
        +Id _id
        +Id userId
        +Id itemId
        +string[] summary
        +number score
        +string reason
        +string model
        +number createdAt
        +get() Query
        +generate() Action
    }
    
    class Draft {
        +Id _id
        +Id userId
        +Id itemId
        +string platform
        +string text
        +string[] hashtags
        +string status
        +number updatedAt
        +list() Query
        +generate() Action
    }
    
    class Voice {
        +Id _id
        +Id userId
        +string tone
        +string audience
        +string[] wordsToUse
        +string[] wordsToAvoid
        +string[] samplePosts
        +get() Query
        +update() Mutation
    }
    
    User "1" --> "*" Grave: owns
    User "1" --> "*" Item: owns
    User "1" --> "0..1" Voice: has
    Grave "1" --> "*" Item: contains
    Item "1" --> "0..1" Seance: summarizes
    Item "1" --> "*" Draft: generates
    User "1" --> "*" Seance: requests
    User "1" --> "*" Draft: creates
```

### MCP Integration Flow

```mermaid
sequenceDiagram
    participant Claude
    participant MCP as MCP Server<br/>/api/mcp
    participant Auth as Auth Middleware
    participant Convex as Convex Backend
    participant AI as AI Provider
    
    Claude->>MCP: tools/list
    MCP->>Claude: [listFeeds, listItems, getItem, summarize, generateDraft]
    
    Claude->>MCP: tools/call summarize<br/>{itemId, apiKey}
    MCP->>Auth: Verify API Key
    Auth->>MCP: userId validated
    
    MCP->>Convex: seance.generate(itemId)
    Convex->>Convex: Check user owns item
    Convex->>Convex: Get article content
    Convex->>AI: Generate summary + score
    AI->>Convex: {summary[], score, reason}
    Convex->>Convex: Store in seances table
    Convex->>MCP: Summary result
    MCP->>Claude: Tool response
    
    Note over Claude,AI: User isolation enforced at every step
```

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
