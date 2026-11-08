// Pushes server-side variables from backend/.env.local to the Convex deployment
// (Convex functions read Convex env vars, not .env.local).
// Run from backend/:  bun run env:push            (dev deployment)
//                     bun run env:push -- --prod  (production deployment)
// Values are passed as process arguments, never through a shell, and never printed.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PUSH = [
  "CLERK_JWT_ISSUER_DOMAIN",
  "APP_URL",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_SEANCE_MODEL",
  "AI_RESURRECT_MODEL",
  "AI_DOCTOR_MODEL",
  "AI_FALLBACK_MODEL",
  "MCP_SERVER_SECRET",
  "AGENT_SERVER_SECRET",
  "NECRO_BOT_CONTACT_URL",
];

const prod = process.argv.includes("--prod");
const env = new Map<string, string>();
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].trim());
}

let failed = 0;
for (const key of PUSH) {
  const value = env.get(key);
  if (!value) {
    console.log(`skip  ${key} (not set in .env.local)`);
    continue;
  }
  const args = ["convex", "env", "set", ...(prod ? ["--prod"] : []), key, value];
  const r = spawnSync("bunx", args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
  if (r.status === 0) console.log(`set   ${key}`);
  else {
    failed++;
    console.log(`FAIL  ${key}: ${r.stderr.toString().trim().split("\n").pop()}`);
  }
}
process.exit(failed ? 1 : 0);
