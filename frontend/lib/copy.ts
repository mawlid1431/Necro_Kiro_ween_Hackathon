// All UI copy and themed labels live here (see .kiro/steering/brand.md, Voice).
// Every themed label carries a plain subtitle.

export const site = {
  name: "Necro",
  tagline: "RSS, resurrected with AI.",
  description:
    "Necro brings your feeds back from the dead: a calm reader, AI summaries, and social drafts in your voice.",
} as const;

export const labels = {
  summon: { themed: "Summon feed", plain: "Add a feed" },
  graveyard: { themed: "The Graveyard", plain: "Your feeds" },
  crypt: { themed: "The Crypt", plain: "Reader" },
  seance: { themed: "Séance", plain: "AI summary" },
  resurrect: { themed: "Resurrect", plain: "Create social posts" },
  doctor: { themed: "Feed Doctor", plain: "Fix broken feeds" },
  bury: { themed: "Bury feed", plain: "Remove feed" },
  risen: { themed: "Risen", plain: "New" },
  settings: { themed: "Settings", plain: "Interests, voice and MCP keys" },
  discover: { themed: "Discover", plain: "Find collections to follow" },
  covens: { themed: "Covens", plain: "Shared feed collections" },
  omens: { themed: "Omens", plain: "Topic alerts" },
  grimoire: { themed: "Grimoire", plain: "Weekly newsletter" },
} as const;

export const TOPICS = {
  ai: "AI",
  security: "Security",
  dev: "Web & dev",
  design: "Design",
  science: "Science",
  business: "Business",
  news: "News",
  creators: "Creators",
  other: "Other",
} as const;
export type Topic = keyof typeof TOPICS;

export const covens = {
  intro: "Start from feeds other readers trust. One click adds a whole collection to your graveyard.",
  search: "Search collections",
  all: "All topics",
  trending: "Trending",
  newest: "Newest",
  empty: "No collections here yet. Publish the first one.",
  feeds: (n: number) => (n === 1 ? "1 feed" : `${n} feeds`),
  followers: (n: number) => (n === 1 ? "1 follower" : `${n} followers`),
  by: (name: string) => `by ${name}`,
  summonAll: "Summon all",
  summoning: "Summoning…",
  summoned: (c: number, d: number) =>
    c ? `${c} feed${c === 1 ? "" : "s"} summoned${d ? `, ${d} already followed` : ""}. They rise in a moment.` : "You already follow every feed here.",
  follow: "Follow",
  following: "Following",
  unfollow: "Unfollow",
  have: "In your graveyard",
  copyLink: "Copy link",
  copied: "Link copied",
  opml: "OPML",
  report: "Report",
  reportPrompt: "Why are you reporting this collection?",
  reported: "Thanks. We'll take a look.",
  yours: "Your covens",
  publish: "Publish a collection",
  edit: "Edit",
  delete: "Delete",
  deleteConfirm: (t: string) => `Delete “${t}”? Followers keep the feeds they already summoned.`,
  hiddenNote: "Hidden from Discover after reports. Only you can see it.",
  followingTitle: "Collections you follow",
  addNew: (n: number) => `Add ${n} new`,
  upToDate: "Up to date",
  trendingFeeds: "Most shared feeds",
  summonOne: "Summon",
  summonedOne: "Summoned",
  notFound: "This collection was removed or the link is wrong.",
  status: { public: "Public", unlisted: "Unlisted", hidden: "Hidden" },
  displayName: "Curator name",
  displayNameHint: "Shown on collections you publish. Leave empty to appear as “A Necro reader”. Never your email.",
  publishTitle: "Publish a collection",
  editTitle: "Edit collection",
  publishBody: "Share some of your feeds. Only the feeds, title and description are public, never what you read.",
  title: "Title",
  description: "Description (optional)",
  topic: "Topic",
  visibility: "Who can see it",
  public: "Public · listed in Discover",
  unlisted: "Unlisted · only people with the link",
  starred: "Also publish an RSS feed of my starred posts",
  pickFeeds: (n: number) => `Feeds to include (${n} selected)`,
  save: "Publish",
  saveEdit: "Save changes",
  noFeeds: "Summon a few feeds first, then share them here.",
} as const;

export type LabelKey = keyof typeof labels;

export const landing = {
  overline: "Kiroween 2026 · Resurrection category",
  title: "RSS is back from the dead",
  lead: "Almost every blog, newsroom and channel still publishes a feed. Necro gives them a good place to rise again.",
  cta: "Enter the graveyard",
  features: [
    {
      key: "summon",
      body: "Paste a site, a feed link or your old OPML export. Every feed becomes a tombstone.",
    },
    {
      key: "seance",
      body: "Three-line summaries and a relevance score, so you read what matters first.",
    },
    {
      key: "resurrect",
      body: "Turn an article into LinkedIn, X and Instagram drafts in your own voice.",
    },
  ] satisfies { key: LabelKey; body: string }[],
} as const;

export const graveyard = {
  emptyTitle: "The graveyard is quiet",
  emptyBody: "Summon your first feed to bring it to life.",
  emptyDiscover: "Or start from a collection other readers trust",
  risenToday: (n: number) => (n === 1 ? "1 post rose today" : `${n} posts rose today`),
  noInterests: "Tell Necro what you care about so each Séance can score relevance for you.",
} as const;

export const summon = {
  title: "Summon a feed",
  body: "Paste a website or a feed link. Necro finds the feed: RSS, Atom or JSON Feed.",
  urlLabel: "Website or feed URL",
  urlPlaceholder: "https://example.com",
  folderLabel: "Folder (optional)",
  submit: "Summon",
  working: "Summoning…",
  opmlTitle: "Or bring back an old reader",
  opmlBody: "Upload an OPML export from any classic feed reader.",
  opmlButton: "Upload OPML",
  duplicate: "You already follow this feed.",
  summoned: (title: string, n: number) => `${title} rose with ${n} posts.`,
  imported: (c: number, d: number, s: number) =>
    `${c} summoned${d ? `, ${d} already followed` : ""}${s ? `, ${s} skipped` : ""}. They rise over the next minutes.`,
} as const;

export const crypt = {
  filters: { all: "All", unread: "Unread", starred: "Starred" },
  sortNewest: "Newest",
  sortRelevance: "Most relevant",
  search: "Search titles",
  allFeeds: "All feeds",
  empty: "Nothing here yet.",
  pickOne: "Pick an article to read it.",
  loadMore: "Load more",
  markAllRead: "Mark all read",
  openOriginal: "Open original",
  star: "Star",
  unstar: "Unstar",
  markUnread: "Mark unread",
} as const;

export const kindred = {
  label: "Kindred",
  plain: "Same story, several feeds",
  alsoIn: (n: number) => (n === 1 ? "Also reported by 1 other feed" : `Also reported by ${n} other feeds`),
  marker: "Also in another feed",
} as const;

export const opinion = {
  label: "Second Opinion",
  plain: "Compare sources",
  open: "Second opinion",
  working: "Comparing sources…",
  agree: "They agree",
  differ: "They differ",
  onlyOne: "Only one source says",
  nothing: "No clear points to compare. Read the sources directly.",
  ghostHint: "Every AI provider was busy, so here are the sources side by side with their key sentences.",
  retry: "Try again with AI",
  caveat: "AI comparison of the feed text. Check the originals before you quote it.",
} as const;

export const grimoire = {
  intro: "Turn the week's best reads into a newsletter or LinkedIn roundup in your voice: starred posts first, then Omen matches and the most relevant. Edit it, then copy it anywhere.",
  compose: "Compose this week's Grimoire",
  composing: "Writing your Grimoire…",
  ghostHint: "Every AI provider was busy, so this is a template from your titles and key points. Edit it freely.",
  copyMarkdown: "Copy Markdown",
  copyText: "Copy text",
  copied: "Copied",
  save: "Save edits",
  saved: "Saved",
  delete: "Delete",
  deleteConfirm: "Delete this Grimoire?",
  history: "Past Grimoires",
  none: "No Grimoires yet. Compose your first one above.",
  items: (n: number) => (n === 1 ? "1 item" : `${n} items`),
  template: "Template",
  editLabel: "Draft (Markdown)",
  voiceHint: "Set your voice in Settings so it sounds like you.",
} as const;

export const omens = {
  intro: "Watch a topic: a competitor, a vulnerability, a research area. Necro tells you when a new post is really about it, not just when a word appears.",
  topic: "Topic to watch",
  topicPlaceholder: "Postgres vulnerability",
  strict: "Strict: only alert when AI confirms it",
  add: "Watch topic",
  adding: "Adding…",
  yours: "Your Omens",
  none: "No Omens yet. Add a topic above and new posts about it show up here.",
  matches: "Recent matches",
  noMatches: "Nothing matched yet. New posts are checked as they rise.",
  matchCount: (n: number) => (n === 1 ? "1 match" : `${n} matches`),
  mute: "Mute",
  unmute: "Unmute",
  muted: "Muted",
  strictTag: "Strict",
  remove: "Delete",
  removeConfirm: (t: string) => `Stop watching “${t}”? Its matches are deleted too.`,
  via: { ai: "AI confirmed", keyword: "Keyword match" },
  read: "Read",
  allTopics: "All topics",
  notify: "Notify me while Necro is open",
  notifyOn: "Notifications are on",
  notifyBlocked: "Notifications are blocked for this site. Allow them in the address bar.",
  notification: (topic: string, title: string) => ({ title: `Omen: ${topic}`, body: title }),
} as const;

export const seance = {
  hold: "Hold a Séance",
  holding: "Summoning the spirits…",
  relevance: "Relevance",
  ghost: "Summary without AI",
  ghostHint: "Every AI provider was busy, so Necro summarised this itself.",
  retry: "Try again with AI",
} as const;

export const resurrect = {
  open: "Resurrect",
  working: "Raising drafts…",
  title: "Resurrect into posts",
  body: "Drafts in your voice. Edit freely, then copy or open the platform.",
  platforms: { linkedin: "LinkedIn", x: "X", instagram: "Instagram" },
  template: "Template draft",
  templateHint: "Written without AI because every provider was busy.",
  copy: "Copy",
  copied: "Copied",
  openIn: (p: string) => `Open ${p}`,
  save: "Save edits",
  saved: "Saved",
  again: "Raise again",
} as const;

export const settings = {
  title: "Settings",
  plain: "Interests, voice and API keys",
  interests: "Interests",
  interestsHint: "Comma-separated, e.g. ai, security, design. Séance scores relevance against these.",
  language: "Summary language",
  voice: "Your voice",
  voiceHint: "Resurrect writes drafts that sound like you.",
  tone: "Tone",
  audience: "Audience",
  wordsToUse: "Words to use",
  wordsToAvoid: "Words to avoid",
  samples: "Sample posts (one per box, up to 3)",
  save: "Save",
  saved: "Saved",
  keys: "MCP keys",
  keysHint: "Let Kiro or any MCP client talk to your graveyard. A key is shown once.",
  keyName: "Key name",
  createKey: "Create key",
  newKey: "Copy this key now. It will not be shown again.",
  revoke: "Revoke",
  revoked: "Revoked",
  lastUsed: "Last used",
  never: "never",
  config: "Client config",
  usage: "Today's usage",
  export: "Export OPML",
} as const;

export const voice = {
  listen: "Listen",
  stop: "Stop",
  talk: "Talk",
  listening: "Listening…",
  heard: (t: string) => `Heard: “${t}”`,
  unknown: (t: string) => `Didn't catch a command in “${t}”.`,
  help: "Try: “read this”, “summarise”, “star it”, “next”, “show unread”, “search security”, “stop”.",
  noArticle: "Open an article first.",
  blocked: "Microphone access was blocked. Allow it in the address bar to talk to Necro.",
} as const;

export const doctorCopy = {
  empty: "Every feed is alive. Nothing to heal.",
  retry: "Retry now",
  tryFix: "Try fix",
  apply: "Use this feed",
  explain: "Explain",
  noFix: "No new address found. The site may have removed its feed.",
  found: (title: string, n: number) => `Found “${title}” with ${n} posts.`,
  bury: "Bury feed",
} as const;

export const nav = {
  graveyard: "Graveyard",
  crypt: "Crypt",
  discover: "Discover",
  omens: "Omens",
  grimoire: "Grimoire",
  doctor: "Doctor",
  settings: "Settings",
} as const;

export const auth = {
  signIn: "Sign in",
  signOut: "Sign out",
} as const;
