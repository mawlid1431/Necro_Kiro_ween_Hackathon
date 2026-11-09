// Live smoke check (spec .kiro/specs/privacy-trust, req 5). Read-only: GET pages, POST to MCP without a valid key.
//   bun run smoke                       → https://necro.malitos.tech
//   SMOKE_URL=http://localhost:3000 bun run smoke
// Exits 1 if any check fails.

const site = (process.env.SMOKE_URL ?? "https://necro.malitos.tech").replace(/\/$/, "");
const convexSite = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "https://hardy-boar-88.eu-west-1.convex.site").replace(/\/$/, "");
const slug = process.env.SMOKE_COVEN ?? "starter-security";

type Check = { name: string; run: () => Promise<string | true> };

const checks: Check[] = [
  {
    name: "landing page renders",
    run: async () => {
      const r = await fetch(site);
      const html = await r.text();
      return r.ok && html.includes("Necro") ? true : `status ${r.status}`;
    },
  },
  {
    name: "signed-in pages exist (served, gated on the client)",
    run: async () => {
      for (const path of ["/graveyard", "/crypt", "/discover", "/omens", "/grimoire", "/settings"]) {
        const r = await fetch(site + path, { redirect: "manual" });
        if (r.status >= 400) return `${path} → ${r.status}`;
      }
      return true;
    },
  },
  {
    name: "public collection OPML",
    run: async () => {
      const r = await fetch(`${convexSite}/c/${slug}.opml`);
      const body = await r.text();
      return r.ok && body.includes("<opml") && body.includes("xmlUrl=") ? true : `status ${r.status}`;
    },
  },
  {
    name: "unknown collection is 404",
    run: async () => {
      const r = await fetch(`${convexSite}/c/no-such-coven-${Date.now()}.opml`);
      return r.status === 404 ? true : `status ${r.status}`;
    },
  },
  {
    name: "MCP refuses a missing key (401)",
    run: async () => {
      const r = await fetch(`${site}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      return r.status === 401 ? true : `status ${r.status}`;
    },
  },
  {
    name: "MCP refuses an unknown key (401)",
    run: async () => {
      const r = await fetch(`${site}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer necro_sk_${"0".repeat(32)}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      return r.status === 401 ? true : `status ${r.status}`;
    },
  },
];

let failed = 0;
for (const c of checks) {
  const t0 = Date.now();
  let result: string | true;
  try {
    result = await c.run();
  } catch (e) {
    result = e instanceof Error ? e.message : String(e);
  }
  const ms = Date.now() - t0;
  if (result === true) console.log(`✓ ${c.name} (${ms} ms)`);
  else {
    failed++;
    console.log(`✗ ${c.name}: ${result}`);
  }
}
console.log(failed ? `\n${failed} of ${checks.length} checks failed against ${site}` : `\nAll ${checks.length} checks passed against ${site}`);
process.exit(failed ? 1 : 0);

export {}; // top-level await needs a module
