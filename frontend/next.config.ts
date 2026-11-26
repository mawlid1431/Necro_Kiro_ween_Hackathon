import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // screenshot_page (MCP) runs a headless Chromium: keep these out of the bundle so their binaries ship as files.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Dev only: lets a temporary cloudflared tunnel (used to test MCP OAuth with ChatGPT, Claude or MCP Inspector)
  // load dev assets and the HMR socket. Has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Pages merged into tabs (Nov 2026): old links keep working.
  async redirects() {
    return [
      { source: "/home", destination: "/dashboard", permanent: false },
      { source: "/doctor", destination: "/graveyard?tab=doctor", permanent: false },
      { source: "/grimoire", destination: "/omens?tab=grimoire", permanent: false },
      { source: "/connectors", destination: "/settings#connections", permanent: false },
    ];
  },
  // The OAuth consent page must never be framed (clickjacking an "Allow" click).
  async headers() {
    return [
      {
        source: "/oauth/authorize",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    // Root is the repo (one level up) so the frontend can import the generated
    // Convex API from ../backend. Pinning it also stops a stray lockfile in the
    // user's home folder from making Next guess the wrong root.
    root: path.join(import.meta.dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
