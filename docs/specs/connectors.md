# Connectors: post straight to LinkedIn, X, Instagram and TikTok

Status: building (2026-11-22)

## Goal

A signed-in Necro user opens **Connectors**, connects their own LinkedIn, X, Instagram and TikTok accounts
with each platform's official OAuth, and from **Resurrect** presses **Post now**. The post appears on their
account **exactly as the preview showed it** (same text, same link card or image), and the dialog shows the
result live (posting → posted, with a link to the live post, or the platform's error in plain words).
It works on the live site, necro.malitos.tech.

### Done means

1. Nav has a **Connectors** link; on small screens the nav is a hamburger menu (no more cramped bottom bar).
2. `/connectors` lists the four platforms with Connect / Reconnect / Disconnect, the connected account's name
   and picture, and token expiry. Changes appear in real time (Convex live queries).
3. Tokens are stored **encrypted** (AES-256-GCM) in Convex, never sent to the browser, refreshed before they
   expire where the platform allows it.
4. Resurrect: each platform tab has **Post now** when connected (the old "open the composer" share stays as the
   fallback). Post status is live from Convex.
5. Preview = post: the preview, the copy button, the counter and the API call all use one string (`finalPost`);
   the link card is read from the article's own Open Graph tags (what X/LinkedIn read); Instagram/TikTok use
   the same generated image the preview shows.
6. Works on production after the developer apps below are created and their keys are set.

## Architecture

```
Browser (Next.js, Vercel)                       Convex (backend)                         Platform
/connectors  ── useAction(begin) ─────────────▶ socialNode.begin: state + PKCE ───┐
   window.location = authorize URL ───────────────────────────────────────────────┼──▶ consent screen
/connectors/callback/[platform] ◀──────────── redirect ?code&state ───────────────┘
   useAction(complete) ───────────────────────▶ socialNode.complete: exchange code,
                                                encrypt tokens, store `connections`
Resurrect "Post now" ── useAction(publish) ───▶ socialNode.publish: refresh token,
   useQuery(publishes) ◀── live status ──────── call platform API, write `publishes`  ──▶ post
```

- All client secrets live in Convex env vars. Nothing secret reaches Vercel or the browser.
- Instagram and TikTok fetch the image from `https://necro.malitos.tech/api/post-image?...&sig=` (JPEG,
  signed with `POST_IMAGE_SECRET`, shared by Vercel and Convex, valid 1 hour).

## Platform facts (official docs, checked 2026-11-22)

| | LinkedIn | X | Instagram | TikTok |
|---|---|---|---|---|
| Auth | OAuth 2.0 code | OAuth 2.0 code + PKCE | Instagram Login (Business) | Login Kit v2 + PKCE |
| Scopes | `openid profile w_member_social` | `tweet.read tweet.write users.read offline.access media.write` | `instagram_business_basic instagram_business_content_publish` | `user.info.basic video.publish` |
| Token | 60 days, no refresh → reconnect | 2 h + refresh token | 1 h → long-lived 60 days, refreshable | 24 h + refresh (365 days) |
| Post call | `POST /rest/posts` (article: title, description, uploaded thumbnail) | `POST /2/tweets` | `/{id}/media` → status → `/{id}/media_publish` | `/v2/post/publish/content/init/` (PHOTO, PULL_FROM_URL) |
| Account needs | any member | any account | **Business or Creator** account | any account |
| To open to the public | self-serve, no review | buy pay-per-use credits (link post ≈ $0.20) | **App Review + Business Verification** (until then only accounts with a role on the app) | **App audit** (until then posts are private, "Only me") |

## What only you can do (accounts and keys)

Redirect URI for every app: `https://necro.malitos.tech/connectors/callback/<platform>`
(and `http://localhost:3000/connectors/callback/<platform>` for local testing where the platform allows http).

1. **LinkedIn** — developer.linkedin.com → Create app (needs a LinkedIn Page) → Products: *Sign In with LinkedIn
   using OpenID Connect* + *Share on LinkedIn* → Auth tab: add redirect URLs → copy Client ID / Secret.
2. **X** — console.x.com → New App → User authentication: OAuth 2.0, *Web App (confidential)*, Read and write,
   callback URL → copy Client ID / Secret → add credits.
3. **Instagram** — developers.facebook.com → Create app (Business) → add *Instagram* product → *API setup with
   Instagram login* → add redirect URL → copy Instagram App ID / Secret. Add your Instagram account as an
   Instagram Tester and accept the invite. For the public: App Review + Business Verification.
4. **TikTok** — developers.tiktok.com → Create app → add *Login Kit* and *Content Posting API* (Direct Post on) →
   redirect URI → verify the domain `necro.malitos.tech` (URL prefix `https://necro.malitos.tech/api/post-image`)
   → copy Client Key / Secret. Submit for audit to post publicly.

Then put these in `backend/.env.local` and run `bun run env:push -- --prod` from `backend/`:

```
SOCIAL_TOKEN_KEY=<32 random bytes, base64>     # encrypts stored tokens
POST_IMAGE_SECRET=<32+ random chars>           # same value in Vercel env
LINKEDIN_CLIENT_ID= / LINKEDIN_CLIENT_SECRET=
X_CLIENT_ID= / X_CLIENT_SECRET=
INSTAGRAM_APP_ID= / INSTAGRAM_APP_SECRET=
TIKTOK_CLIENT_KEY= / TIKTOK_CLIENT_SECRET=
```

A platform without keys shows "Not set up yet" on /connectors instead of breaking.

## Steps

1. Exact-match preview (`lib/post.ts`, `/api/link-preview`, `/api/post-image`) — done.
2. Hamburger nav + Connectors link.
3. Convex: `connections`, `oauthStates`, `publishes` tables; `social.ts` (queries/mutations) and
   `socialNode.ts` (OAuth + publish actions, token encryption, refresh cron for Instagram).
4. `/connectors` page and `/connectors/callback/[platform]`.
5. Resurrect: Post now + live status; TikTok tab (uses the Instagram caption and image).
6. Typecheck, lint, backend tests; verify locally; deploy Convex + Vercel after you confirm.
