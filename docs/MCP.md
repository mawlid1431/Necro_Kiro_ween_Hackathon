# Talk to the Dead: Necro's MCP server

Connect an AI assistant (Kiro, Claude, any MCP client) to your Necro account. It can read your feeds and, with a
"read and write" key, post or schedule to the social accounts you connected in Necro, for example a poster you just
designed with it.

- **Endpoint:** `POST https://necro.malitos.tech/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Auth:** `Authorization: Bearer necro_sk_...`, a personal key created in **Settings → MCP keys**
- **User guide:** [necro.malitos.tech/docs](https://necro.malitos.tech/docs), step by step for Kiro, Claude Code, Claude,
  Cursor, ChatGPT and VS Code, with copyable configs and a prompt that lets a coding agent set itself up
- **Keys:** revoke any time; a revoked key can then be deleted for good (with its usage counts) in Settings → MCP keys
- **Limits:** 60 requests a minute per key; up to 10 posts an hour per key; Séance, Ask and Summon also count against
  the app's daily limits

## Two kinds of key

| | Read only | Read and write |
|---|---|---|
| Read feeds, articles, summaries, stats, your posts and connected accounts | yes | yes |
| Add a feed (`add_grave`) | no | yes |
| Post now or schedule (`create_post`), cancel (`cancel_post`) | no | yes |
| Expires | never (revoke any time) | after 90 days (revoke any time) |

Keys made before key types existed are **read only**. A read-only key does not even see the write tools, and every
write call is checked again on the server (the key's owner, type, revocation and expiry), so a client cannot get
around it.

## Safety rules for posting

- **You approve each post.** Write tools are marked as changing things, so Kiro and Claude ask before running them,
  and the server tells the assistant to show you the final text and image first and to never post because an
  article or web page asked it to.
- **Same rules as the app:** platform length limits; Instagram and TikTok need an image; at most 100 scheduled posts
  and the hourly caps; and **one post, once**: the same text and picture can never go to the same account twice. The
  picture is recognised by its content, so sending the same image again still counts as the same post.
- **Connected accounts only.** An account that is not connected (and TikTok, always) gets a reminder in the Witching
  Hour to share it yourself, instead of posting on its own. `list_connections` tells the assistant which is which.
- **Images:** an `https` URL or base64 data, PNG or JPG only, decided from the file's own bytes. URLs up to 8 MB are
  downloaded by the server through the same safe fetcher as feeds (private and internal addresses are blocked);
  base64 up to about 5 MB.
- **Audit:** every post an assistant creates records which key made it and shows as `createdBy: "ai-assistant"`.
- Tokens, passwords and other users' data are never readable through MCP.

## Connect your assistant

Create the key in Necro **Settings → MCP keys** (it is shown once). Keep it out of any folder you commit: this repo's
`.kiro` folder is public.

**Kiro** (IDE or CLI): put this in your user-level `~/.kiro/settings/mcp.json`
(Windows: `C:\Users\<you>\.kiro\settings\mcp.json`) and set the `NECRO_API_KEY` environment variable:

```json
{
  "mcpServers": {
    "necro": {
      "url": "https://necro.malitos.tech/api/mcp",
      "headers": { "Authorization": "Bearer ${NECRO_API_KEY}" }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add --transport http necro https://necro.malitos.tech/api/mcp --header "Authorization: Bearer necro_sk_..."
```

**Claude Desktop** and other clients that only start local servers: use `mcp-remote` (Settings shows this config
with your app's address):

```json
{
  "mcpServers": {
    "necro": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://necro.malitos.tech/api/mcp", "--header", "Authorization: Bearer ${NECRO_API_KEY}"],
      "env": { "NECRO_API_KEY": "necro_sk_..." }
    }
  }
}
```

**ChatGPT and claude.ai (OAuth, no key needed).** These connectors sign in with OAuth 2.1 instead of a key:

1. In ChatGPT: *Settings → Apps & Connectors → Advanced → Developer mode* on, then *Create* a connector. In claude.ai:
   *Settings → Connectors → Add custom connector*.
2. URL: `https://necro.malitos.tech/api/mcp` (also shown in Necro *Settings → Connected apps*). Authentication: OAuth.
   Leave client id and secret empty: Necro supports Client ID Metadata Documents (ChatGPT's default) and Dynamic Client
   Registration.
3. You are sent to Necro's **Connect ChatGPT to Necro** page (sign in first if needed). Choose **Read only** or
   **Read and write** (same meaning as the key types above; read only is preselected), then **Allow**.
4. The app now lists the tools. A read-only connection never sees `add_grave`, `create_post` or `cancel_post`.

Connected apps appear in *Settings → Connected apps* with their access, expiry and last use; **Disconnect** stops one
at once. Reconnecting the same app replaces its old connection. Up to 10 connected apps per user.

OAuth details (for client authors): metadata at `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728) and
`/.well-known/oauth-authorization-server` (RFC 8414); endpoints `/oauth/authorize`, `/oauth/token`, `/oauth/register`,
`/oauth/revoke` (RFC 7009: revoking either token ends the whole connection).
Public clients only (PKCE S256 required, `token_endpoint_auth_method: none`), scopes `read` and `write`, `resource`
(RFC 8707) must be this server's `/api/mcp` URL, and every authorization response carries `iss` (RFC 9207). Access
tokens last 1 hour; refresh tokens rotate on every use (the previous one works for 60 seconds, reuse after that ends
the connection). Connections end after 90 days (write) or 365 days (read). A 401 from `/api/mcp` carries
`WWW-Authenticate: Bearer resource_metadata="…"`. Redirect URIs must be https, or http on localhost (MCP Inspector).
To test locally with a real client: `bun run build && npx next start -p 3100` in `frontend`, then
`cloudflared tunnel --url http://localhost:3100` and use `<tunnel>/api/mcp` as the connector URL (the issuer follows the
forwarded host and protocol; set `MCP_PUBLIC_ORIGIN` only to force one). Sign in to Necro on the tunnel domain first.
Prefer the production build: the dev server reloads on every file change, which interrupts Clerk's sign-in on a tunnel
(`allowedDevOrigins` already lists `*.trycloudflare.com` for `next dev`). Tested this way with MCP Inspector (Nov 2026).

Safety and scale notes for OAuth:
- **Same checks as keys.** Every MCP request re-resolves the token in Convex (revocation and expiry apply on the next
  request), with 60 requests a minute per connection; write tools are re-checked on the server (`mcpWrite.liveKey`).
- **Shared-IP clients.** ChatGPT and Claude call from shared server IPs, so nothing is limited per IP for existing
  users. Identical registrations reuse one client id; only *new* distinct apps are limited (60 an hour per caller,
  1,000 in total). Client metadata documents are fetched at most once a day per app (cached, 60 fetches an hour per
  host), through the same SSRF-safe fetcher as feeds.
- **Consent.** The page cannot be framed, always shows where you will be sent back, and warns when an app registered
  itself (its name is unverified). Apps identified by their own metadata URL (like ChatGPT) show that domain.
- **Cleanup.** A daily job removes expired codes, connections that ended over 30 days ago and unused registrations, in
  batches that reschedule themselves until done.
- **Logs.** One line per token event (`ev: "oauth"`, step and status); never tokens, codes or client ids.

Try:
- *"What rose in my graveyard since yesterday? Summarise the best two."*
- *"Which of my accounts are connected to Necro?"*
- *"Here is the poster we made. Schedule it to my LinkedIn tomorrow at 9:00 Kuala Lumpur time with this caption: …"*
- *"Show my scheduled posts and cancel the one for Friday."*

## Tools

| Tool | Key | Input | Returns |
|---|---|---|---|
| `list_graves` | any | none | id, title, feedUrl, status, unreadCount, folder per feed |
| `get_grave` | any | `graveId` | One feed's details and its last error with a plain-language diagnosis |
| `list_items` | any | `graveId?`, `filter` all/unread/starred, `limit` 1–50 (20), `cursor?` | id, title, feed, publishedAt, score, isRead; `nextCursor` |
| `get_item` | any | `itemId` | title, link, author, date and plain text (max 8,000 chars) |
| `search_items` | any | `query` 1–200 chars, `limit` 1–50 (10) | Matching items, same shape as `list_items` |
| `get_seance` | any | `itemId` | 3 bullets, a 0–100 score and a reason. Holds one if missing (daily limit) |
| `get_stats` | any | none | feeds, unread, starred, Séances today, broken and sleeping feeds |
| `get_briefing` | any | none | The latest Morning Séance with its picked items, or null |
| `ask_crypt` | any | `question` 2–500 chars | An answer from your own items with cited item ids (20 a day) |
| `list_kindred` | any | `limit` 1–20 (10) | Stories reported by more than one feed |
| `get_omens` | any | `limit` 1–30 (10) | Watched topics (Omens) and recent matches, each with a reason and "ai" or "keyword" |
| `list_connections` | any | none | Per platform: connected, account name, and delivery `auto` (posts on its own) or `reminder` |
| `list_posts` | any | `limit` 1–50 (20) | Posts from the last 30 days and next 90: status, time, text, image, live link, created by app or assistant |
| `add_grave` | write | `url`, `folder?` | Same Summon as the app: safe fetch, discovery, dedupe, 300-feed cap |
| `create_post` | write | `text`, `platforms[]`, `schedule_at?` (ISO with timezone; omit to post now), `image_url?` or `image_base64?` | One row per account: id, delivery, status, time |
| `cancel_post` | write | `post_id` | The cancelled post |

Text that came from websites carries `"source": "untrusted web content"` so the calling model treats it as data, not
instructions. Errors return `isError: true` with a short code (`NOT_FOUND`, `LIMIT`, `DUPLICATE`, `NOT_A_FEED`,
`BLOCKED`, `INVALID_INPUT`, `FORBIDDEN`), never a stack trace.

## Key lifecycle

- Create a key in Settings and choose **Read only** or **Read and write**. It is shown **once**: Necro stores only its
  SHA-256 hash and the first characters as a prefix.
- Up to 5 active keys per user. Revoke a key in Settings; it stops working on the next request. Write keys also stop
  at their expiry date (shown in Settings).
- `lastUsedAt` shows in Settings, updated at most once a minute.

## How it works

1. `frontend/app/api/mcp/route.ts` hashes the bearer key (`necro_sk_…`) or OAuth access token (`necro_at_…`) and calls
   `mcp.authenticate` or `mcpOAuth.authenticate` in Convex with `MCP_SERVER_SECRET`; both return the same
   `{ userId, keyId, scope }` (for OAuth, `keyId` is the grant id). The OAuth server lives in `backend/convex/mcpOAuth.ts`
   (+ `mcpOAuthNode.ts` to fetch client metadata) and `frontend/app/oauth/*`; codes and tokens are stored only as SHA-256. That mutation resolves the key to a user, its type and expiry, and enforces the rate limit, so
   a bad, revoked or expired key or a flood is answered with 401 or 429 before any MCP work.
2. A fresh MCP server is built for the request (`frontend/app/api/mcp/tools.ts`) with the read tools, plus the write
   tools only for a "read and write" key.
3. Read tools call `backend/convex/mcp.ts`; posting tools call `backend/convex/mcpWrite.ts` (and
   `mcpWriteNode.ts` for images). Every function re-checks `MCP_SERVER_SECRET`; write functions also re-check the key
   itself. Posting runs the app's own composer (`social.composeFor`), so it follows exactly the same rules.

**Environment:** `MCP_SERVER_SECRET` (32+ random characters) must be identical in Vercel (frontend) and Convex
(backend). Rotate it if it is ever exposed.

**Logs:** one line per call with the tool name, key prefix, latency and status. Arguments, post text and article text
are never logged.
