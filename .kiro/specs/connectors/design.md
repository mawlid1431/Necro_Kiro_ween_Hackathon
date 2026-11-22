# Connectors — design

Full research notes and setup steps: `docs/specs/connectors.md`.

## Flow
```
/connectors ── begin(platform) ──▶ Convex socialNode.begin: state (+ PKCE verifier) → oauthStates
   └─ browser goes to the platform's consent screen
/connectors/callback/[platform] ◀─ redirect ?code&state
   └─ complete(platform, code, state) ──▶ takeState (single use) → exchange code → profile → seal → connections
Resurrect "Post now" ── publish(draftId, platform, text) ──▶ startPublish → fresh token → platform API → finishPublish
   └─ useQuery(publishesForItem) shows the status live
```

## Data (Convex)
| Table | Purpose |
|---|---|
| `connections` | One row per user and platform: account id, name, picture, sealed tokens, expiry, status |
| `oauthStates` | Single-use OAuth state + PKCE verifier, 15-minute lifetime |
| `publishes` | Every Post now: status, link to the post or error; read live by the dialog |

## Modules
| File | Job |
|---|---|
| `backend/lib/social/post.ts` | `finalPost`, `postLength` (X counts links as 23), limits; shared with the frontend |
| `backend/lib/social/providers.ts` | Authorize URL, code exchange, refresh, profile and publish for each platform (plain fetch) |
| `backend/lib/social/crypto.ts` | AES-256-GCM seal/unseal with `SOCIAL_TOKEN_KEY` |
| `backend/lib/social/imageSig.ts` | HMAC-signed, 1-hour links to the post image (`POST_IMAGE_SECRET`) |
| `backend/lib/social/og.ts` | Open Graph / Twitter card parser (preview and LinkedIn post) |
| `backend/convex/social.ts` | Queries (no tokens), state, connections, publishes |
| `backend/convex/socialNode.ts` | Node actions: begin, complete, publish, tiktokCreator, daily Instagram refresh |
| `frontend/app/api/link-preview` | Signed-in, SSRF-guarded fetch of an article's card tags |
| `frontend/app/api/post-image` | 1080×1080 image (PNG for the user, JPEG for a signed link) |

## Platform choices
| | API | Notes |
|---|---|---|
| LinkedIn | Posts API (`/rest/posts`), article content with uploaded thumbnail | Commentary escaped for the "little text" format; 60-day token, no refresh |
| X | `POST /2/tweets` | OAuth 2.0 + PKCE, confidential client; card drawn by X from the link |
| Instagram | Instagram Login, container → status → `media_publish` | Business/Creator accounts; long-lived token refreshed daily |
| TikTok | Content Posting API, PHOTO, `PULL_FROM_URL`, `DIRECT_POST` | Domain verification; private until the app is audited |

## Security
- Every action resolves the caller from the Clerk session; ids from the client are checked for ownership.
- Tokens are sealed at rest; queries return account names only.
- Article and image fetches use the SSRF-safe fetch (private addresses blocked at connect time).
- The image endpoint needs a signed-in user or a valid HMAC signature.
