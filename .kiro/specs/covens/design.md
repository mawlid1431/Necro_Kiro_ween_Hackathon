# Covens — design

## Data (backend/convex/schema.ts)
- `collections`: `userId, slug (10 random chars, unique), title, description, topic, visibility
  ("public" | "unlisted"), feeds: [{ feedUrl, title, siteUrl? }] (snapshot, ≤ 50), starredFeed: boolean,
  followerCount, subscribeCount, reportCount, hidden: boolean, updatedAt`.
  Indexes: `by_user`, `by_slug`, `by_public_followers [visibility, hidden, followerCount]`,
  `by_public_topic [visibility, hidden, topic, followerCount]`; search index on `title` filtered by
  `visibility`, `hidden`, `topic`.
- `collectionFollows`: `userId, collectionId` · `by_user`, `by_collection`, `by_user_collection`.
- `collectionReports`: `userId, collectionId, reason` · `by_user_collection`.
- `users.displayName` (optional, public).

Snapshot, not live link: a collection stores feed URLs, never grave ids, so a follower never touches the
curator's private rows and the curator can unsubscribe privately without breaking the collection.

## Functions (backend/convex/covens.ts)
| Function | Type | Notes |
|---|---|---|
| `mine` | query | My collections |
| `create` / `update` / `remove` | mutation | Owner check on graves; limits; rate limit `publish:<user>` |
| `discover` | query | `{ topic?, search?, sort: "trending" \| "new" }`, public + not hidden, ≤ 30 cards |
| `get` | query | By slug; public or unlisted; adds `alreadyHave[]` and `following` for the viewer |
| `follow` / `unfollow` | mutation | Idempotent; maintains `followerCount` |
| `subscribeAll` | action | Re-checks URLs (SSRF), then `graves.createMany` (poller fetches), auto-follows |
| `report` | mutation | One per user; hides at 3 |
| `trendingFeeds` | query | Counts feed URLs across the top public collections |
| `seedStarters` | internalAction | Curated starter collections, each feed validated with safeFetch + parse |

HTTP (backend/convex/http.ts): `GET /c/<slug>.opml` and `GET /c/<slug>/starred.xml` (RSS 2.0, escaped).

## UI (frontend)
- `/discover`: topic chips, search, sort, collection cards; detail panel via `?c=<slug>` with feed list
  ("Following" marks), **Summon all**, **Follow**, **Copy link**, **OPML**, **Report**.
- "Your covens": publish dialog (pick feeds from my graves, title, description, topic, visibility,
  starred feed toggle), edit, delete.
- Graveyard empty state and nav link point to Discover. Settings gets a public display name.

## Privacy
Discover cards and detail views are built from collection rows only (no join to private tables except the
viewer's own graves for `alreadyHave`). Curator identity = display name. Counts from public collections only.
