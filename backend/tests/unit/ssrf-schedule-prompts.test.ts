// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkUrl, isBlockedIp, SafeFetchError } from "../../lib/security/ssrf";
import { afterFailure, afterSuccess, jitter } from "../../lib/schedule";
import { cleanHashtags, fitTo, RESURRECT_SYSTEM, seancePrompt } from "../../lib/ai/prompts";
import { clientCodeFor, diagnose } from "../../lib/errors";

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "ff02::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isBlockedIp(ip)).toBe(false),
  );

  it.each([
    ["ftp://example.com/feed", "BAD_URL"],
    ["https://user:pw@example.com/", "BAD_URL"],
    ["http://localhost:3000/", "BLOCKED"],
    ["http://metadata.internal/", "BLOCKED"],
    ["http://169.254.169.254/latest/meta-data", "BLOCKED"],
    ["http://[::1]/", "BLOCKED"],
    ["https://example.com:22/", "BLOCKED"],
    ["not a url", "BAD_URL"],
  ])("rejects %s with %s", (url, code) => {
    try {
      checkUrl(url);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SafeFetchError);
      expect((e as SafeFetchError).code).toBe(code);
    }
  });

  it("accepts public http(s) URLs", () => {
    expect(checkUrl("https://example.com/feed.xml").hostname).toBe("example.com");
    expect(checkUrl("http://example.com:8080/rss").port).toBe("8080");
  });
});

describe("polling schedule", () => {
  const now = 1_000_000_000_000;
  const mid = () => 0.5; // no jitter
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;

  it("polls active feeds often and sleeping feeds daily", () => {
    expect(afterSuccess(now, now - H, mid)).toEqual({ nextFetchAt: now + 15 * MIN, status: "alive" });
    expect(afterSuccess(now, now - 3 * D, mid)).toEqual({ nextFetchAt: now + H, status: "alive" });
    expect(afterSuccess(now, now - 10 * D, mid)).toEqual({ nextFetchAt: now + 6 * H, status: "alive" });
    expect(afterSuccess(now, now - 40 * D, mid)).toEqual({ nextFetchAt: now + D, status: "dormant" });
    expect(afterSuccess(now, undefined, mid).status).toBe("dormant");
  });

  it("backs off on failure and marks broken from the third", () => {
    expect(afterFailure(now, 1, "TIMEOUT", "alive", mid)).toEqual({ nextFetchAt: now + 15 * MIN, status: "alive" });
    expect(afterFailure(now, 2, "TIMEOUT", "alive", mid)).toEqual({ nextFetchAt: now + H, status: "alive" });
    expect(afterFailure(now, 3, "TIMEOUT", "alive", mid)).toEqual({ nextFetchAt: now + 6 * H, status: "broken" });
    expect(afterFailure(now, 5, "TIMEOUT", "broken", mid)).toEqual({ nextFetchAt: now + D, status: "broken" });
    expect(afterFailure(now, 1, "HTTP_429", "alive", mid).nextFetchAt).toBe(now + H);
  });

  it("jitters within ±10%", () => {
    expect(jitter(1000, () => 0)).toBe(900);
    expect(jitter(1000, () => 1)).toBe(1100);
  });
});

describe("prompts", () => {
  it("fits X posts to 280 characters including the link", () => {
    const link = "https://example.com/a-very-long-article-slug";
    const out = fitTo("word ".repeat(100).trim(), 280, link);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith(link)).toBe(true);
    expect(fitTo(`short ${link}`, 280, link)).toBe(`short ${link}`); // link not duplicated
  });

  it("tells Resurrect not to claim the author's work as the user's", () => {
    expect(RESURRECT_SYSTEM).toMatch(/did NOT write the article/);
    expect(RESURRECT_SYSTEM).toMatch(/I replicated/);
  });

  it("cleans hashtags", () => {
    expect(cleanHashtags(["rss", "#RSS", "##web", "#"])).toEqual(["#rss", "#web"]);
  });

  it("wraps untrusted article text and truncates it", () => {
    const p = seancePrompt({ interests: [], title: 'A "quoted" title', text: "x".repeat(10_000) });
    expect(p).toContain(`<article title="A 'quoted' title">`);
    expect(p).toContain("none given");
    expect(p.length).toBeLessThan(6_400);
  });
});

describe("errors", () => {
  it("diagnoses codes in plain language", () => {
    expect(diagnose("HTTP_404")).toMatch(/no longer exists/);
    expect(diagnose("HTTP_502")).toMatch(/server is having trouble/);
    expect(diagnose(undefined)).toMatch(/long time/);
    expect(clientCodeFor("BLOCKED")).toBe("BLOCKED");
    expect(clientCodeFor("DNS")).toBe("NOT_A_FEED");
  });
});
