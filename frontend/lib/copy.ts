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
} as const;

export type LabelKey = keyof typeof labels;

export const landing = {
  overline: "Kiroween 2026 · a Faafi project",
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
  summonSoon: "Summoning arrives in the next phase.",
} as const;

export const auth = {
  signIn: "Sign in",
  signOut: "Sign out",
} as const;
