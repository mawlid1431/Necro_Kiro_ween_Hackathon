import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // convex-test runs Convex functions in the edge runtime, like production.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Property tests (hundreds of runs) and 100-call limit tests can pass 5 s on a busy machine.
    testTimeout: 60_000,
  },
});
