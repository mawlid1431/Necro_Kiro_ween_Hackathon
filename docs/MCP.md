# Talk to the Dead: Necro's MCP server

Any MCP client (Kiro, AI desktop apps, IDE agents) can read and work with your graveyard.

- **Endpoint:** `POST https://<your-app>/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Auth:** `Authorization: Bearer necro_sk_...`, a personal key created in Necro Settings
- **Limits:** 60 requests a minute per key; Séance, Ask and Summon also count against the app's daily limits

## Connect a client

Clients that support remote MCP servers can use the URL and header directly. For clients that only run local servers, use `mcp-remote`:

```json
{
  "mcpServers": {
    "necro": {
      "command": "npx",
      "args": ["mcp-remote", "https://YOUR-APP.vercel.app/api/mcp", "--header", "Authorization: Bearer ${NECRO_API_KEY}"],
      "env": { "NECRO_API_KEY": "necro_sk_..." }
    }
  }
}
```

Try: *"What rose in my graveyard since yesterday? Summarise the best two."*

## Tools

| Tool | Input | Returns |
|---|---|---|
| `list_graves` | none | id, title, feedUrl, status, unreadCount, folder per feed |
| `get_grave` | `graveId` | One feed's details and its last error with a plain-language diagnosis |
| `list_items` | `graveId?`, `filter` all/unread/starred, `limit` 1–50 (20), `cursor?` | id, title, feed, publishedAt, score, isRead; `nextCursor` |
| `get_item` | `itemId` | title, link, author, date and plain text (max 8,000 chars) |
| `search_items` | `query` 1–200 chars, `limit` 1–50 (10) | Matching items, same shape as `list_items` |
| `get_seance` | `itemId` | 3 bullets, a 0–100 score and a reason. Holds one if missing (daily limit) |
| `add_grave` | `url`, `folder?` | Same Summon as the app: safe fetch, discovery, dedupe, 300-feed cap |
| `get_stats` | none | feeds, unread, starred, Séances today, broken and sleeping feeds |
| `get_briefing` | none | The latest Morning Séance with its picked items, or null |
| `ask_crypt` | `question` 2–500 chars | An answer from your own items with cited item ids (20 a day) |
| `list_kindred` | `limit` 1–20 (10) | Stories reported by more than one feed |
| `get_omens` | `limit` 1–30 (10) | Watched topics (Omens) and recent matches, each with a reason and "ai" or "keyword" |

Text that came from websites carries `"source": "untrusted web content"` so the calling model treats it as data, not instructions. Errors return `isError: true` with a short code (`NOT_FOUND`, `LIMIT`, `NOT_A_FEED`, `BLOCKED`, `INVALID_INPUT`), never a stack trace.

## Key lifecycle

- Create a key in Settings. It is shown **once**: Necro stores only its SHA-256 hash and the first characters as a prefix.
- Up to 5 active keys per user. Revoke a key in Settings; it stops working on the next request.
- `lastUsedAt` shows in Settings, updated at most once a minute.

## How it works

1. `frontend/app/api/mcp/route.ts` hashes the bearer key and calls `mcp.authenticate` in Convex with `MCP_SERVER_SECRET`. That mutation resolves the key to a user and enforces the rate limit, so a bad key or a flood is answered with 401 or 429 before any MCP work.
2. A fresh MCP server is built for the request (`frontend/app/api/mcp/tools.ts`) and handles it through the SDK's web-standard Streamable HTTP transport.
3. Each tool calls a function in `backend/convex/mcp.ts`. Those functions are public, so every one re-checks `MCP_SERVER_SECRET` and filters by the resolved user. Séance, Ask and Summon run the exact same flows as the app, with the same limits, caching, AI ladder and `safeFetch`.

**Environment:** `MCP_SERVER_SECRET` (32+ random characters) must be identical in Vercel (frontend) and Convex (backend). Rotate it if it is ever exposed.

**Logs:** one line per call with the tool name, key prefix, latency and status. Arguments and article text are never logged.
