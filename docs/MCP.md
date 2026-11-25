# Talk to the Dead: Necro's MCP server

Connect an AI assistant (Kiro, Claude, any MCP client) to your Necro account. It can read your feeds and, with a
"read and write" key, post or schedule to the social accounts you connected in Necro, for example a poster you just
designed with it.

- **Endpoint:** `POST https://necro.malitos.tech/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Auth:** `Authorization: Bearer necro_sk_...`, a personal key created in **Settings → MCP keys**
- **User guide:** [necro.malitos.tech/docs](https://necro.malitos.tech/docs), step by step for Kiro, Claude Code, Claude,
  Cursor, ChatGPT and VS Code, with copyable configs and a prompt that lets a coding agent set itself up
- **Keys:** revoke any time; a revoked key can then be deleted for good (with its usage counts) in Settings → MCP keys
- **Limits:** 60 requests a minute per key; per key with posting on: 20 posts a day and 10 an hour (one per account a
  post goes to) and 60 posting calls an hour (Convex env vars `MCP_POSTS_PER_DAY`, `MCP_WRITE_CALLS_PER_HOUR`);
  Séance, Ask and Summon also count against the app's daily limits

## Two kinds of key

| | Read only | Read and write |
|---|---|---|
| Read feeds, articles, summaries, stats, your posts and connected accounts | yes | yes |
| See your Home overview (`get_dashboard`) and live pictures of it (`get_page_image`) | yes | yes |
| Add a feed (`add_grave`) | no | yes |
| Post and schedule (`upload_post_image`, `create_post`, `get_post`, `update_post`, `cancel_post`, `publish_post_now`) | no | yes |
| Expires | never (revoke any time) | after 90 days (revoke any time) |

"Read and write" is the **`posts:write`** scope (stored as `"write"`). Keys made before key types existed are
**read only**. Turn posting on or off for an existing key or connected app with **Allow posting / Make read-only** in
Settings → MCP keys (turning it on for a key starts its 90-day expiry), then reconnect the app so it loads the new
tool list. A read-only key does not even see the write tools, and every write call is checked again on the server
(the key's owner, scope, revocation and expiry), so a client cannot get around it.

Every posting call, successful or refused, is written to an audit log (key, tool, post id, time, and the reason when
refused), shown under **Posting activity** in Settings → MCP keys. It never stores tokens or post text.

## Safety rules for posting

- **You approve each post.** Write tools are marked as changing things, so Kiro and Claude ask before running them,
  and the server tells the assistant to show you the final text and image first and to never post because an
  article or web page asked it to.
- **Same rules as the app:** platform length limits; Instagram and TikTok need an image; at most 100 scheduled posts
  and the hourly caps; and **one post, once**: the same text and picture can never go to the same account twice. The
  picture is recognised by its content, so sending the same image again still counts as the same post.
- **Connected accounts only.** An account that is not connected (and TikTok, always) gets a reminder in the Witching
  Hour to share it yourself, instead of posting on its own. `list_connections` tells the assistant which is which.
- **Images:** `upload_post_image` takes an http(s) URL or base64 data with `mimeType`, PNG or JPEG only (LinkedIn and
  Instagram refuse WebP), up to 5 MB, decided from the file's own bytes. URLs are downloaded by the server through the
  same safe fetcher as feeds (private and internal addresses are blocked, the size cap applies while downloading).
- **Same pipeline as New post.** A post made through MCP is the same `publishes` rows, scheduler job and history as one
  made in the app, so it appears live in Witching Hour and on Home without a refresh.
- **Times:** `scheduleAt` must be ISO 8601 with a time zone (e.g. `2026-11-26T09:00:00+08:00`), to the minute, at
  least a minute ahead and at most 90 days. Times are stored in UTC and returned in UTC and Singapore time.
- **Idempotency:** `create_post` needs an `idempotencyKey`; calling again with the same key returns the first post
  (`duplicate: true`) and never creates a second one.
- **Edits:** `update_post` only while the post is scheduled; `cancel_post` also cancels a reminder that is due but not
  shared yet. Nothing that went out can be edited or cancelled.
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
4. The app now lists the tools. A read-only connection never sees `add_grave` or the posting tools.

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
| `get_page_image` | any | `page`: `dashboard` (default), `posts`, `feeds` | An MCP image block (PNG, 1200 px wide) drawn from live data, plus a short text summary |
| `get_dashboard` | any | none | Home overview, live: feeds, new today, post counts, next scheduled and recently posted (with links), read next, connections, setup |
| `list_posts` | any | `limit` 1–50 (20) | Posts from the last 30 days and next 90: status, time, text, image, live link, created by app or assistant |
| `add_grave` | write | `url`, `folder?` | Same Summon as the app: safe fetch, discovery, dedupe, 300-feed cap |
| `upload_post_image` | write | nothing (→ `{ uploadUrl }` to POST raw bytes to), then `storageId`; or `imageUrl`; or `imageBase64` + `mimeType` (`image/png`, `image/jpeg`) | `{ imageId, previewUrl, contentType, bytes }` |
| `create_post` | write | `text`, `platforms[]` (`linkedin`, `x`, `instagram`, `tiktok`), `imageId?`, `scheduleAt?` (omit = now), `sourceItemId?`, `idempotencyKey` | `{ postId, status, scheduledFor: { utc, singapore, label }, perPlatform: [{ platform, publishId, delivery, status }], duplicate }` |
| `get_post` | write | `postId` | text, image, status overall and per platform, `liveUrl`, `error`, times in UTC and Singapore |
| `update_post` | write | `postId`, any of `text`, `imageId`, `platforms`, `scheduleAt` | The updated post (same shape as `get_post`) |
| `cancel_post` | write | `postId` (`post_id` still accepted) | `{ postId, status: "canceled", perPlatform }` |
| `publish_post_now` | write | `postId` | The post; call `get_post` a few seconds later for `posted` and the live link |

`list_posts` rows also carry `postId`, the id the posting tools take. A post to several platforms is one `postId` with
one `publishId` per platform.

### How a picture of your Necro gets to your assistant

`get_page_image` reads the same live data as the app (`mcp.getDashboard`, `mcpWrite.posts`, `mcp.listGraves`), draws it on
Necro's server with `next/og` (no browser, no cookies), and returns it as an MCP `image` content block (base64 PNG).
The chat app shows it like any image. It works with read-only access and is fresh on every call.

### How a poster made in your assistant gets into Necro

MCP tool calls are JSON text, so an image travels one of three ways:

| Where the poster is | Route | Why |
|---|---|---|
| A file the assistant can read (Kiro, Claude Code, Cursor, a code tool) | `upload_post_image {}` → `curl -X POST -H 'Content-Type: image/png' --data-binary @poster.png '<uploadUrl>'` → `upload_post_image { storageId }` | Raw bytes over HTTPS, straight into Necro's storage: fast, no token cost |
| At a public link (an image tool's output URL, a site, a CDN) | `upload_post_image { imageUrl }` | Necro downloads it itself through the SSRF-safe fetcher |
| A small image the assistant holds as data | `upload_post_image { imageBase64, mimeType }` | Works anywhere, but base64 is about 1.3 bytes per byte and costs tokens |

An image you paste into a chat app (claude.ai, ChatGPT) is shown to the model as a picture, not as a file it can
send on, so the assistant cannot forward it. Use a link, or upload it in Necro's composer. Whatever the route, Necro
checks the file's own bytes (PNG or JPEG, up to 5 MB) before it can be posted, and the returned `previewUrl` lets the
assistant show you the exact image before you approve the post.

**Which accounts:** when you name a platform ("post this to LinkedIn"), only that one is used. When you say "my
accounts", the assistant uses the connected ones from `list_connections` and asks before adding reminder-only ones.

### Example calls

```json
{ "name": "upload_post_image", "arguments": { "imageUrl": "https://example.com/necro-v1.png" } }
{ "name": "create_post", "arguments": {
    "text": "Necro v1 is live: RSS, resurrected with AI.",
    "platforms": ["linkedin", "x"],
    "imageId": "<imageId from upload_post_image>",
    "scheduleAt": "2026-11-26T09:00:00+08:00",
    "idempotencyKey": "necro-v1-launch" } }
{ "name": "update_post", "arguments": { "postId": "<postId>", "scheduleAt": "2026-11-26T09:30:00+08:00" } }
{ "name": "get_post", "arguments": { "postId": "<postId>" } }
```

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
   tools only for a key or app with posts:write. `get_page_image` is drawn in `frontend/app/api/mcp/pageImage.ts`.
3. Read tools call `backend/convex/mcp.ts`; posting tools call `backend/convex/mcpWrite.ts` (and
   `mcpWriteNode.ts` for images). Every function re-checks `MCP_SERVER_SECRET`; write functions also re-check the key
   itself. Posting runs the app's own composer (`social.composeFor`), so it follows exactly the same rules.

**Environment:** `MCP_SERVER_SECRET` (32+ random characters) must be identical in Vercel (frontend) and Convex
(backend). Rotate it if it is ever exposed.

**Logs:** one line per call with the tool name, key prefix, latency and status. Arguments, post text and article text
are never logged.
