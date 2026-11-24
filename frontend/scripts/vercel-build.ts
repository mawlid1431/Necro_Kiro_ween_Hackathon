// Vercel build: one push ships both halves of Necro.
//
// Production (VERCEL_ENV=production with CONVEX_DEPLOY_KEY set):
//   1. backend typecheck + tests (a red test stops the deploy before anything goes live)
//   2. `convex deploy` pushes backend/convex to the production deployment and runs the Next.js build
//      with NEXT_PUBLIC_CONVEX_URL pointing at it. If the Next.js build fails, Convex does not push.
// Preview / development, or no deploy key: the Next.js build only (previews never touch production data).
//
// Runs with bun from frontend/ (vercel.json buildCommand). Secrets are read from the environment, never printed.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(frontend, "..", "backend");

function run(label: string, cmd: string, args: string[], cwd: string): void {
  console.log(`\n▸ ${label}`);
  // No shell: arguments (like the --cmd string) reach the program exactly as written, on Linux (Vercel) and Windows.
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`\n✖ ${label} failed (exit ${r.status ?? r.signal}). Nothing was deployed to Convex.`);
    process.exit(r.status ?? 1);
  }
}

const env = process.env.VERCEL_ENV ?? "local";
const hasKey = !!process.env.CONVEX_DEPLOY_KEY;

if (env === "production" && hasKey) {
  console.log("Production build: checking the backend, then deploying Convex and building the site together.");
  run("Backend typecheck", "bun", ["run", "typecheck"], backend);
  run("Backend tests", "bun", ["run", "test"], backend);
  run(
    "Convex deploy + Next.js build",
    "bun",
    ["x", "convex", "deploy", "--cmd", `cd "${frontend}" && bun run build`, "--cmd-url-env-var-name", "NEXT_PUBLIC_CONVEX_URL"],
    backend,
  );
  console.log("\n✔ Convex functions and the website were deployed together.");
} else {
  if (env === "production") {
    console.warn("⚠ CONVEX_DEPLOY_KEY is not set: building the website only. Convex production will NOT be updated.");
  } else {
    console.log(`${env} build: website only (Convex production is never deployed from previews).`);
  }
  run("Next.js build", "bun", ["run", "build"], frontend);
}
