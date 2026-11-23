// Topic classifier: one topic per article (and per free-text interest) from a fixed list.
// Deterministic and explainable: weighted whole-word / phrase matches over the feed's own categories (x3),
// the title (x2) and the excerpt (x1). Below MIN_SCORE the topic is "other". When a real AI model holds a
// Séance it may replace this guess (items.topicBy = "ai"); Ghost mode keeps the keyword topic.

export const TOPICS = ["ai", "security", "dev", "tech", "design", "science", "business", "news", "creators", "other"] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  ai: "AI",
  security: "Security",
  dev: "Web & dev",
  tech: "Tech & gadgets",
  design: "Design",
  science: "Science",
  business: "Business",
  news: "News",
  creators: "Creators",
  other: "Other",
};

// Lowercase words or phrases. Matched on word boundaries, so "ai" never matches inside "said".
const LEXICON: Record<Exclude<Topic, "other">, string[]> = {
  ai: [
    "ai", "a.i.", "artificial intelligence", "machine learning", "deep learning", "neural network", "llm", "llms",
    "large language model", "gpt", "chatgpt", "openai", "anthropic", "claude", "gemini", "mistral", "llama",
    "copilot", "generative", "genai", "transformer", "diffusion model", "embedding", "embeddings", "agentic",
    "ai agent", "ai agents", "prompt", "prompts", "fine-tuning", "inference", "hugging face", "nvidia", "rag",
  ],
  security: [
    "security", "cybersecurity", "vulnerability", "vulnerabilities", "cve", "exploit", "exploited", "zero-day",
    "ransomware", "malware", "phishing", "breach", "data breach", "hacker", "hackers", "hacked", "attack",
    "attackers", "patch", "infosec", "encryption", "backdoor", "botnet", "ddos", "spyware", "threat actor",
    "authentication", "password", "passwords", "privacy", "leak", "leaked", "ssh", "ssh keys", "secrets",
    "api key", "api keys", "2fa", "mfa", "passkey", "passkeys", "firewall", "vpn", "surveillance",
  ],
  dev: [
    "javascript", "typescript", "python", "rust", "golang", "java", "kotlin", "swift", "c++", "react",
    "next.js", "node.js", "nodejs", "deno", "bun", "npm", "api", "apis", "sdk", "framework", "library",
    "open source", "open-source", "github", "git", "compiler", "programming", "developer", "developers",
    "software engineering", "database", "postgres", "sql", "kubernetes", "docker", "devops", "linux", "css",
    "html", "webassembly", "wasm", "release notes", "refactor", "bug", "debugging", "code", "coding",
  ],
  tech: [
    "tech", "technology", "gadget", "gadgets", "apple", "iphone", "ipad", "mac", "macbook", "airpods", "ios",
    "android", "samsung", "galaxy", "pixel", "google", "microsoft", "windows", "amazon", "meta", "laptop",
    "laptops", "smartphone", "smartphones", "phone", "phones", "tablet", "smartwatch", "wearable", "headphones",
    "earbuds", "router", "wi-fi", "wifi", "5g", "chip", "chips", "semiconductor", "processor", "cpu", "gpu",
    "intel", "amd", "qualcomm", "tesla", "electric vehicle", "ev", "evs", "gaming", "game", "games", "console",
    "nintendo", "playstation", "xbox", "steam", "vr", "headset", "camera", "tv", "streaming device", "black friday",
    "deal", "deals", "review", "hardware", "battery", "charger", "usb-c", "app", "apps", "update", "spacex",
    "gta", "gta 6", "gta6", "video game", "video games", "gift guide", "gifts",
  ],
  design: [
    "design", "designer", "designers", "ux", "ui", "user experience", "user interface", "typography", "font",
    "fonts", "figma", "branding", "brand identity", "logo", "illustration", "color", "colour", "layout",
    "accessibility", "a11y", "prototype", "prototyping", "design system", "visual", "animation", "motion",
  ],
  science: [
    "science", "scientists", "research", "researchers", "study", "physics", "chemistry", "biology", "astronomy",
    "space", "nasa", "esa", "telescope", "planet", "galaxy", "climate", "species", "genome", "dna", "vaccine",
    "medicine", "medical", "health", "neuroscience", "quantum", "fossil", "evolution", "ocean", "peer-reviewed",
  ],
  business: [
    "business", "startup", "startups", "funding", "raises", "series a", "series b", "seed round", "venture",
    "investors", "ipo", "acquisition", "acquires", "merger", "revenue", "profit", "earnings", "market",
    "markets", "stock", "stocks", "shares", "economy", "economic", "inflation", "layoffs", "ceo", "founder",
    "founders", "saas", "pricing", "growth", "marketing", "sales", "e-commerce", "ecommerce", "hiring",
    "jobs", "yc", "y combinator", "billion", "valuation",
  ],
  news: [
    "news", "breaking", "politics", "political", "election", "elections", "government", "president", "minister",
    "parliament", "congress", "senate", "court", "supreme court", "police", "war", "ceasefire", "protest",
    "protests", "world", "law", "lawsuit", "policy", "regulation", "eu", "united nations", "officials",
  ],
  creators: [
    "creator", "creators", "creator economy", "youtube", "youtuber", "tiktok", "instagram", "podcast",
    "podcasts", "newsletter", "newsletters", "substack", "patreon", "influencer", "influencers", "audience",
    "content creator", "streaming", "streamer", "blogging", "blog", "writing", "writer", "writers", "linkedin",
  ],
};

// When two topics tie, the more specific one wins.
const TIE_ORDER: Topic[] = ["security", "ai", "dev", "design", "science", "creators", "tech", "business", "news", "other"];
const MIN_SCORE = 2;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One regex per topic: (?<![\p{L}\p{N}])(word1|word2|...)(?![\p{L}\p{N}]) so matches are whole words.
const MATCHERS: [Topic, RegExp][] = (Object.keys(LEXICON) as (keyof typeof LEXICON)[]).map((t) => [
  t,
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${LEXICON[t].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu"),
]);

function countIn(text: string, re: RegExp): number {
  if (!text) return 0;
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) && n < 10) n++;
  return n;
}

export interface TopicInput {
  categories?: string[];
  title?: string;
  excerpt?: string;
}

/** Scores per topic, for tests and debugging. */
export function topicScores(input: TopicInput): Record<Topic, number> {
  const cats = (input.categories ?? []).join(" · ").toLowerCase();
  const title = (input.title ?? "").toLowerCase();
  const excerpt = (input.excerpt ?? "").slice(0, 600).toLowerCase();
  const out = Object.fromEntries(TOPICS.map((t) => [t, 0])) as Record<Topic, number>;
  for (const [t, re] of MATCHERS) {
    out[t] = 3 * Math.min(countIn(cats, re), 2) + 2 * Math.min(countIn(title, re), 3) + Math.min(countIn(excerpt, re), 4);
  }
  return out;
}

export function classifyTopic(input: TopicInput): Topic {
  const scores = topicScores(input);
  let best: Topic = "other";
  for (const t of TIE_ORDER) if (scores[t] > scores[best]) best = t;
  return scores[best] >= MIN_SCORE ? best : "other";
}

/** A user's interests ("AI agents, web security, typography") as a set of topics. */
export function topicsOfInterests(interests: string[]): Topic[] {
  const out = new Set<Topic>();
  for (const i of interests) {
    const t = classifyTopic({ title: i }); // a single matching word in an interest scores 2
    if (t !== "other") out.add(t);
  }
  return [...out];
}

export function isTopic(s: unknown): s is Topic {
  return typeof s === "string" && (TOPICS as readonly string[]).includes(s);
}
