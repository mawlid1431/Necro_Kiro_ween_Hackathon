// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bestIcon, looksSmall } from "../../lib/feeds/icons";

const page = (links: string) => `<html><head>${links}</head><body><link rel="icon" href="https://evil.test/late.png" sizes="999x999"></body></html>`;

describe("site icons", () => {
  it("picks the largest declared icon (the WordPress pattern)", () => {
    const html = page(`
      <link rel="icon" href="/up/IS-32x32.png" sizes="32x32" />
      <link rel="icon" href="/up/IS-192x192.png" sizes="192x192" />
      <link rel="apple-touch-icon" href="/up/IS-180x180.png" />`);
    expect(bestIcon(html, "https://inkstick.test/")).toBe("https://inkstick.test/up/IS-192x192.png");
  });

  it("uses apple-touch-icon or SVG when sizes are missing, and ignores the body", () => {
    expect(bestIcon(page(`<link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/touch.png">`), "https://a.test")).toBe("https://a.test/touch.png");
    expect(bestIcon(page(`<link rel="icon" type="image/svg+xml" href="/logo.svg">`), "https://a.test")).toBe("https://a.test/logo.svg");
  });

  it("returns nothing for small-only, non-https or script icons", () => {
    expect(bestIcon(page(`<link rel="icon" href="/favicon.ico">`), "https://a.test")).toBeNull();
    expect(bestIcon(page(`<link rel="apple-touch-icon" href="http://a.test/t.png">`), "http://a.test")).toBeNull();
    expect(bestIcon(page(`<link rel="apple-touch-icon" href="javascript:alert(1)">`), "https://a.test")).toBeNull();
  });

  it("spots small icon URLs", () => {
    expect(looksSmall("https://x.test/wp-content/uploads/cropped-IS-Favicon-32x32.png")).toBe(true);
    expect(looksSmall("https://x.test/favicon.ico")).toBe(true);
    expect(looksSmall(undefined)).toBe(true);
    expect(looksSmall("https://x.test/apple-touch-icon.png")).toBe(false);
  });
});
