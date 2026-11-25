# Spec: MCP posting and scheduling tools

Status: implemented (see the changelog in README). Findings: [../mcp-posting-findings.md](../mcp-posting-findings.md).

## Model

- A **post** is the set of `publishes` rows (one per platform) created by one `create_post` call. They share
  `groupId` (the id of the first row). `postId` in every tool means that group id. A row created before this change
  has no `groupId`, so its own id works as its `postId`.
- `idemKey` is stored on every row of the group. The index `by_user_idem` makes the lookup exact.
- Status per platform: `scheduled`, `due` (a reminder whose time came), `posting`, `posted`, `failed`, `canceled`.
  The overall status is derived (`lib/social/postStatus.ts`): `posting` > `scheduled` > `due` > `partly_posted` >
  `failed` > `posted` > `canceled`.
- Times are stored in UTC (ms). Every tool returns `{ utc, singapore, label }`, for example
  `{ "utc": "2026-11-26T01:00:00.000Z", "singapore": "2026-11-26T09:00:00+08:00", "label": "Thu 26 Nov 2026, 09:00 SGT" }`.

## Tools (all write tools need a key or OAuth grant with `posts:write`, stored as scope `"write"`)

| Tool | Input | Returns |
|---|---|---|
| `upload_post_image` | `imageBase64` + `mimeType` (`image/png`, `image/jpeg`) **or** `imageUrl` (http/https) | `{ imageId, previewUrl, contentType, bytes }` |
| `create_post` | `text`, `platforms[]`, `imageId?`, `scheduleAt?` (ISO 8601 **with** offset; omit = now), `sourceItemId?`, `idempotencyKey` | `{ postId, status, scheduledFor, perPlatform: [{ platform, publishId, delivery, status }], duplicate? }` |
| `get_post` | `postId` | `{ postId, text, image, sourceItemId, createdBy, status, scheduledFor, liveUrl, error, perPlatform: [...] }` |
| `update_post` | `postId`, any of `text`, `imageId`, `platforms`, `scheduleAt` | same shape as `get_post` |
| `cancel_post` | `postId` (`post_id` still accepted) | `{ postId, status: "canceled", perPlatform }` |
| `publish_post_now` | `postId` | same shape as `get_post` (status `scheduled` until the job claims it seconds later) |

`list_posts` keeps its shape and gains a `postId` field on each row.

## Rules

- Text required (trimmed). Per-platform limits from `POST_LIMITS` (LinkedIn 3,000, X 280 with links counted as 23,
  Instagram 2,200, TikTok 4,000); the error gives the count, e.g. `Too long for X: 312 characters (limit 280).`
- `scheduleAt` must carry a time zone (`Z` or `±HH:MM`), be at least a minute ahead and at most 90 days ahead.
  The scheduler runs at that exact millisecond, so minute-level times are kept.
- Instagram and TikTok need an image (same as the app).
- Delivery per platform from `modeFor` (unchanged): connected = `auto`, otherwise `reminder`; TikTok always `reminder`.
- `update_post` and `cancel_post` only while every live row is `scheduled`; otherwise `INVALID_INPUT` with the status.
- Same `idempotencyKey` for the same user returns the existing post (`duplicate: true`) and creates nothing.

## Security

- Every write mutation re-checks `MCP_SERVER_SECRET`, owner, revoked, expired and scope (`liveKey`).
- Limits (`backend/lib/limits.ts`, env overrides): `MCP_POSTS_PER_DAY` (20 posts per key per day, one per platform
  row), `MCP_WRITE_CALLS_PER_HOUR` (60 write calls per key per hour), plus the existing 10 posts/hour/key and the
  app's own per-user caps.
- Audit: table `mcpAudit` `{ userId, keyId, keyLabel, tool, postId?, status, message?, at }`. Successful writes are
  recorded inside the same transaction; refused writes are recorded by the MCP route. Shown in Settings → MCP keys.
- Scope toggle: `apiKeys.setScope` / `mcpOAuth.setScope` (owner only). Turning on writing for an API key sets the
  90-day expiry used for new write keys.
- No token, hash or secret is ever returned. Image URLs go through `safeFetch` (http/https only, private ranges
  blocked, size cap while streaming).

## Files changed

- `backend/convex/schema.ts`: `publishes.groupId`, `publishes.idemKey`, two indexes; `mcpAudit` table.
- `backend/convex/social.ts`: `composeFor` takes `{ groupId, idemKey, itemId }`; new `editScheduledFor`,
  `publishNowFor`, `cancelGroupFor`, `groupRows`.
- `backend/convex/mcpWrite.ts`: new `post`, `update`, `publishNow`, `startImageUpload`, `audit`, `setScope` helpers;
  `compose`/`cancel` use groups, idempotency, limits and audit.
- `backend/convex/mcpWriteNode.ts`: returns `imageId` + `previewUrl`; 5 MB cap; `mimeType` check.
- `backend/convex/apiKeys.ts`, `backend/convex/mcpOAuth.ts`: `setScope`; `backend/convex/usage.ts` or `mcpWrite.ts`: audit list.
- `backend/lib/limits.ts`, `backend/lib/social/time.ts`, `backend/lib/social/postStatus.ts`, `backend/lib/social/imageBytes.ts`.
- `frontend/app/api/mcp/tools.ts`: the six tools.
- `frontend/components/settings/ApiKeys.tsx`, `ConnectedApps.tsx`, `frontend/lib/copy.ts`: scope toggle, audit list.
- Tests: `backend/tests/convex/mcpPosting.test.ts`, `backend/tests/unit/mcpPosting.test.ts`, updated `mcpWrite.test.ts`.
- Docs: `frontend/components/docs/Docs.tsx`, `README.md`, `docs/MCP.md`.
