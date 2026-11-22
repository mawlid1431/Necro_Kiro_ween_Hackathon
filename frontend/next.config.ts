import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Pages merged into tabs (Nov 2026): old links keep working.
  async redirects() {
    return [
      { source: "/doctor", destination: "/graveyard?tab=doctor", permanent: false },
      { source: "/grimoire", destination: "/omens?tab=grimoire", permanent: false },
      { source: "/connectors", destination: "/settings#connections", permanent: false },
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
