// Human-readable model labels for the UI: "groq:llama-3.3-70b-versatile" -> "Llama 3.3 70B · Groq".
// Pure (no Node APIs) so the frontend imports it too. "ghost:*" means no AI model answered.

const PROVIDERS: Record<string, string> = {
  groq: "Groq",
  google: "Google",
  openrouter: "OpenRouter",
  gateway: "Vercel AI Gateway",
  mock: "Test model",
};

const DROP = new Set(["versatile", "instruct", "it", "chat", "preview", "latest", "exp", "hf"]);
const UPPER = new Set(["gpt", "oss", "ai", "llm", "r1", "v3", "qwq"]);

export function isGhostModel(spec: string | null | undefined): boolean {
  return !spec || spec.startsWith("ghost:");
}

function prettyId(id: string): string {
  let free = false;
  let s = id.trim();
  if (s.endsWith(":free")) {
    free = true;
    s = s.slice(0, -5);
  }
  if (s === "openrouter/free" || s === "free") return "Free model router";
  const last = s.split("/").pop() ?? s;
  const words = last
    .split(/[-_]/)
    .filter((w) => w && !DROP.has(w.toLowerCase()))
    .map((w) => {
      const l = w.toLowerCase();
      if (/^\d+(\.\d+)?[bkm]$/.test(l)) return l.toUpperCase(); // 70b -> 70B
      if (/^a\d+b$/.test(l)) return l.toUpperCase(); // a4b -> A4B (active parameters)
      if (UPPER.has(l)) return l.toUpperCase();
      if (/^\d/.test(l)) return l; // version numbers stay as written
      return l.charAt(0).toUpperCase() + l.slice(1);
    });
  const name = words.join(" ") || last;
  return free ? `${name} (free)` : name;
}

/** "Llama 3.3 70B · Groq", or null for Ghost (no AI). */
export function modelLabel(spec: string | null | undefined): string | null {
  if (isGhostModel(spec)) return null;
  const at = spec!.indexOf(":");
  if (at < 0) return prettyId(spec!);
  const provider = spec!.slice(0, at);
  const id = spec!.slice(at + 1);
  const p = PROVIDERS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
  return provider === "mock" ? p : `${prettyId(id)} · ${p}`;
}
