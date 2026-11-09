// Fixed-output model for tests and offline demos. Only resolvable when
// AI_ALLOW_MOCK=true, which is never set in production.
import { MockLanguageModelV4 } from "ai/test";

const OUTPUTS: Record<string, unknown> = {
  seance: {
    summary: [
      "The article explains the main idea in plain words.",
      "It gives one concrete example that supports the idea.",
      "It ends with what readers can do next.",
    ],
    score: 72,
    reason: "Close to the reader's stated interests.",
  },
  resurrect: {
    linkedin: "A short, useful read on this topic. The key point: keep it simple. Worth a look.",
    x: "A short, useful read on this topic. Worth a look.",
    instagram: "A short, useful read on this topic. Link in bio.",
    hashtags: ["#rss", "#reading", "#web"],
  },
  doctor: { note: "The feed moved. Try fix to find its new address." },
  omen: { match: true, reason: "The article is about the watched topic." },
  // I9 was never picked: the section filter must drop it.
  grimoire: {
    title: "The week in reasoning models",
    intro: "A short tour of what caught my eye this week. Two stories stood out.",
    sections: [
      { ref: "I1", body: "Alpha reports a faster model for tool calling, with cheaper runs for developers." },
      { ref: "I9", body: "An item that was never picked and must not appear." },
    ],
    outro: "See you next week.",
  },
  // S9 is outside any real group: the citation filter must drop it.
  opinion: {
    agree: [{ point: "Both report the same launch date.", sources: ["S1", "S2", "S9"] }],
    differ: [{ point: "The price is reported differently.", views: [{ source: "S1", says: "It costs ten dollars." }, { source: "S2", says: "It costs twelve dollars." }] }],
    onlyOne: [{ claim: "A second model ships next month.", source: "S2" }, { claim: "An invented claim.", source: "S9" }],
  },
};

export function mockModel(id: string): MockLanguageModelV4 {
  const json = JSON.stringify(OUTPUTS[id] ?? OUTPUTS.seance);
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: id,
    doGenerate: async () => ({
      content: [{ type: "text", text: json }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}
