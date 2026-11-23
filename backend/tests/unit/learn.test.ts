import { describe, expect, it } from "vitest";
import { learnProfile, learnedContext, type Signal } from "../../lib/ai/learn";

const NOW = Date.UTC(2026, 10, 24);
const DAY = 86_400_000;

describe("learnProfile", () => {
  it("weights posting above starring above summarising, and recent above old", () => {
    const signals: Signal[] = [
      { kind: "posted", topic: "security", title: "Patch the OpenSSH flaw now", at: NOW - DAY },
      { kind: "starred", topic: "ai", title: "Small models for agents", at: NOW - DAY },
      { kind: "summarised", topic: "design", title: "Type scales", at: NOW - DAY },
      { kind: "posted", topic: "business", title: "Old funding story", at: NOW - 120 * DAY }, // 4 half-lives old
    ];
    const l = learnProfile(signals, NOW);
    expect(l.topics.map((t) => t.topic)).toEqual(["security", "ai", "design"]); // business decayed below 5%
    expect(l.topics.reduce((a, t) => a + t.share, 0)).toBeGreaterThanOrEqual(95);
  });

  it("keeps only subjects that recur, never single words or stop words", () => {
    const l = learnProfile(
      [
        { kind: "starred", topic: "ai", title: "Agents that write Rust code", feed: "Blog A", at: NOW },
        { kind: "starred", topic: "ai", title: "Why agents need memory", feed: "Blog A", at: NOW },
        { kind: "summarised", topic: "dev", title: "Rust 2.0 is here", feed: "Blog B", at: NOW },
      ],
      NOW,
    );
    expect(l.terms).toEqual(expect.arrayContaining(["agents", "rust"]));
    expect(l.terms).not.toContain("that");
    expect(l.terms).not.toContain("memory"); // seen once
    expect(l.feeds[0]).toBe("Blog A");
  });

  it("says nothing until there is enough activity: no invented profile", () => {
    expect(learnedContext(learnProfile([{ kind: "starred", topic: "ai", title: "One thing", at: NOW }], NOW))).toBeNull();
    expect(learnedContext(null)).toBeNull();
  });

  it("produces a short, factual prompt line", () => {
    const l = learnProfile(
      Array.from({ length: 4 }, (_, i) => ({ kind: "posted" as const, topic: "ai" as const, title: `Agents news ${i}`, feed: "Blog A", at: NOW })),
      NOW,
    );
    expect(learnedContext(l)).toBe("Learned from this reader's own activity (4 actions, recent ones count more): topics AI 100%; recurring subjects: agents; favourite sources: Blog A.");
  });
});
