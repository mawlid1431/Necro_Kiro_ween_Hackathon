---
inclusion: always
---

# Security rules

## User isolation

- Every Convex query, mutation and action resolves the caller through `convex/lib/auth.ts` (`requireUser`) and filters by `userId`.
- Never accept a `userId` argument from the client.
- When reading a record by id, check `record.userId === user._id` and treat a mismatch exactly like "not found".
- `convex-test` tests must prove user A cannot read or change user B's data.

## SSRF (safe fetcher, `convex/fetcher.ts` + `lib/security/ssrf.ts`)

- Only `http:` and `https:`.
- Resolve DNS and block private, loopback, link-local and metadata ranges: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, 100.64/10, ::1, fc00::/7, fe80::/10, and IPv4-mapped IPv6 forms of all of them.
- Follow redirects manually, max 5, re-checking every hop.
- 10 s timeout, 5 MB max body, only XML/HTML/RSS/Atom content types.
- `User-Agent: NecroBot/1.0 (+<NECRO_BOT_CONTACT_URL>)`.

## Untrusted content

- Sanitise all article HTML with an allowlist (sanitize-html): no scripts, iframes, styles or event handlers; images get `referrerpolicy="no-referrer"`; links get `rel="noopener noreferrer nofollow"`.
- XML parsing: disable entity expansion; enforce size limits on feeds and OPML (XML bombs).

## Prompt injection

- Wrap article text in clear delimiters (`<article>...</article>`), tell the model to ignore any instructions inside it, truncate to ~6000 chars, and validate output with Zod. Never let model output trigger tool calls or writes without validation.

## Secrets

- Real keys only in `.env.local` and Convex environment variables. `.env*` is gitignored; `.env.example` is committed with empty values.
- AI and AWS keys are server-side (Convex env), never `NEXT_PUBLIC_*`.
- MCP API keys: generate with a CSPRNG, prefix `necro_sk_`, show once, store only a SHA-256 hash + prefix, support revoke, rate-limit per key, never return keys in any response.
