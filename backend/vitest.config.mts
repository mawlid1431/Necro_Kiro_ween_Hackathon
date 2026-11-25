import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // The MCP tool layer (frontend/app/api/mcp/tools.ts) imports the backend this way; tests/mcp drive it end to end.
      "@backend": fileURLToPath(new URL("./", import.meta.url)),
      // Next.js's server-only guard throws outside React Server Components; in tests it is the package's own no-op.
      "server-only": fileURLToPath(new URL("../frontend/node_modules/server-only/empty.js", import.meta.url)),
    },
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
