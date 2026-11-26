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
| Draft, schedule, publish, edit, cancel, retry posts (`draft_post`, `schedule_post`, `publish_post`, …); change feeds, articles, interests, voice, settings | no | yes |
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
- **One post, once:** a draft is queued once: calling `schedule_post` or `publish_post` again for the same draft returns the same post, and the same text and image can never go to the same account twice.
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

Read tools are listed for every key and connected app. Write tools are listed only for **Read and write** ones; a
read-only key that calls one anyway gets `"This key is read only"` (code `FORBIDDEN`) from the route, and every Convex
write function re-checks the scope itself. Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`), and `publish_post`, `cancel_post`, `remove_grave` and `mark_all_read` refuse to run without
`confirm: true` (code `CONFIRM_REQUIRED`). Every write call and screenshot writes an `mcpAudit` row (Settings → MCP keys).

### Read (any key)

| Tool | Input | Returns |
|---|---|---|
| `get_dashboard` | none | Home overview, live, plus `series`: the Home charts' per-day data (14 UTC days: new articles, posts sent, AI uses, MCP calls) |
| `get_analytics` | `range` 7d / 30d / 90d (30d) | Per-day arrays in the user's time zone: newArticles, articlesRead, seancesHeld, averageRelevance, postsPosted / Scheduled / Failed; totals; perFeed; perPlatform |
| `get_profile` | none | Name, email, avatar, plan, today's limits and usage, time zone, created date, setup checklist with next steps, this connection's scope |
| `get_settings` | none | Profile, language, time zone, Morning Séance hour, privacy, interests, voice, Omens, connected accounts |
| `get_voice` / `get_interests` | none | The voice profile / the interests |
| `list_mcp_access` | none | Keys and connected apps: name, label, scope, status, created, last used. Never a key value or hash |
| `list_pages` | none | Every page: id, title, path, what it shows, inputs it needs |
| `get_page_image` | `page` (from `list_pages`), `graveId?` `itemId?` `postId?`, `section?`, `theme` light/dark, `width` 360–1920 (1280), `fullPage` (true) | A real screenshot (image block) + text with `renderer: "browser"` or `"fallback"` |
| `get_all_page_images` | `pages?` (default: every page that needs no id), `offset`, `theme`, `width`, `fullPage` | Up to 3 screenshots per call and `nextOffset` |
| `screenshot_page` | `page`, `section?`, `fullPage?` | Older name for `get_page_image` |
| `list_graves` / `get_grave` / `list_folders` | — / `graveId` / — | Feeds; one feed with its last error; folders with their feeds |
| `list_items` | `graveId?`, `folder?`, `filter`, `since?`, `until?`, `minScore?`, `limit`, `cursor?` | Articles (paged when no folder, date or score filter is used) |
| `get_item` / `search_items` | `itemId` / `query` | One article's text; title search |
| `get_seance` / `hold_seance` | `itemId` | 3 bullets, a 0–100 score and a reason (holds one if missing) |
| `get_stats` / `get_briefing` / `ask_crypt` / `list_kindred` / `get_omens` | as before | Counts, the Morning Séance, answers from your articles, shared stories, topic alerts |
| `list_connections` | none | Per platform: connected, account, delivery `auto` or `reminder` |
| `list_posts` | `status?` (draft too), `platform?`, `since?`, `until?`, `limit` | Posts newest first with times in UTC, Singapore and the user's zone |
| `get_post` | `postId` (a draft or a queued post) | Text, image, per-platform status and delivery, live link, error |

### Write (Read and write keys only)

| Tool | Input | Does |
|---|---|---|
| `add_grave` | `url`, `folder?` | Summon: safe fetch, feed discovery, dedupe, cap |
| `update_grave` / `move_grave` | `graveId`, `title?`, `folder?` (null = none) | Rename / change folder (`graves.renameFor`, `moveFor`) |
| `create_folder` | `name`, `graveIds[]` | Puts feeds in a new folder (a folder exists while it holds a feed) |
| `refresh_grave` | `graveId` | The Feed Doctor's retry: fetch now |
| `remove_grave` | `graveId`, `confirm` | Unsubscribe and delete its articles (`graves.layToRestFor`) |
| `mark_read` / `mark_unread` / `star` / `unstar` | `itemId` | Reading state (`items.setReadFor`, `setStarredFor`) |
| `mark_all_read` | `graveId?`, `confirm` | Every unread article, one feed or all |
| `set_interests` / `set_voice` / `set_omens` | interests[] / voice fields / `add[]`, `remove[]` | The setup steps and watched topics (same helpers as Settings) |
| `update_settings` / `set_briefing_time` | language, time zone, hour, display name, private mode / `hour` | Settings (`users.setPreferencesFor`) |
| `upload_post_image` | nothing → `uploadUrl`, then `storageId`; or `imageUrl`; or `imageBase64` + `mimeType` | `{ imageId, imageUrl, previewUrl }` |
| `draft_post` | `text`, `platforms[]`, `imageId?` or `imageUrl?`, `sourceItemId?` | A **draft** (`postDrafts`): postId, status `draft`, per-platform characters and delivery. Nothing is sent |
| `generate_post_from_item` | `itemId`, `platform` | Resurrect in the user's voice, saved as a draft |
| `schedule_post` / `reschedule_post` | `postId`, `scheduleAt` (ISO 8601; no zone = Singapore) | Queues the draft through `social.composeFor` at that minute, or moves a queued post |
| `publish_post` | `postId`, `confirm` | Queues a draft now, or sends a scheduled post now |
| `update_post` | `postId`, `text?`, `imageId?`, `platforms?`, `scheduleAt?` | Edits a draft, or a post still scheduled |
| `cancel_post` | `postId`, `confirm` | Discards a draft or cancels a scheduled post |
| `retry_post` | `postId` | Sends the failed platforms again |

**Delivery, said plainly:** LinkedIn posts on its own when connected. X, Instagram and TikTok are `reminder` deliveries
while they are "coming soon" (no app credentials on the server): the user is reminded to share them, and every draft
says so in `deliveryNote`. Nothing is ever reported as posted unless the platform answered.

**Not available, and why:** there is no `generate_briefing` (the app has no briefing generator yet: `briefings` is only
read), and theme, notifications and default post platforms are not stored on the server (theme lives in the browser;
the other two do not exist in Necro), so `update_settings` cannot change them.

### Real screenshots (`get_page_image`)

`frontend/lib/server/screenshot.ts`. The route first calls `mcpWrite.screenshotGrant` once per page (live key, 60 an
hour per key, audit row). Then Necro's server mints a Clerk sign-in token (single use, 60 seconds; never the user's own
session cookie), opens a fresh headless Chromium (`puppeteer-core` + `@sparticuz/chromium` on Vercel; a local Chrome in
development), signs it in with that ticket, and for each page: loads it on Necro's own origin (main-frame navigation is
limited to Necro and Clerk's sign-in handshake), waits until loading skeletons are gone, the text has settled and the
charts are drawn (reduced motion, so they draw at once), masks every API key (`necro_sk_…`, `necro_at_…` and the key
prefixes in Settings), and takes the screenshot. It never clicks or types. The session is then revoked through Clerk's
API and the browser closed; only the images are returned. If the browser fails, `dashboard`, `analytics`, `setup`,
`feeds` and `calendar` fall back to a server drawing of the same live data (`pageImage.ts`, with the Activity chart),
marked `renderer: "fallback"`; other pages return the error. MCP has no tool that creates, revokes or deletes keys.

`bun --conditions=react-server scripts/shots.ts <origin> <clerkUserId> <outDir>` (in `frontend/`) photographs every page
in `list_pages` as one user and fails if any page is not a browser screenshot.

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
{ "name": "draft_post", "arguments": {
    "text": "Necro v1 is live: RSS, resurrected with AI.",
    "platforms": ["linkedin", "x"],
    "imageId": "<imageId from upload_post_image>" } }
{ "name": "get_page_image", "arguments": { "page": "post-preview", "postId": "<postId>" } }
{ "name": "schedule_post", "arguments": { "postId": "<postId>", "scheduleAt": "2026-11-26T09:00:00+08:00" } }
{ "name": "publish_post", "arguments": { "postId": "<postId>", "confirm": true } }
{ "name": "get_post", "arguments": { "postId": "<postId>" } }
```

Text that came from websites carries `"source": "untrusted web content"` so the calling model treats it as data, not
instructions. Errors return `isError: true` with a short code (`NOT_FOUND`, `LIMIT`, `DUPLICATE`, `NOT_A_FEED`,
`BLOCKED`, `INVALID_INPUT`, `FORBIDDEN`, `CONFIRM_REQUIRED`), never a stack trace.

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
