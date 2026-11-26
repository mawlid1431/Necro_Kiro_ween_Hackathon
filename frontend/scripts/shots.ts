// Manual proof for get_page_image: photographs every page in list_pages as a real user, with the real headless
// browser, and checks each one came back as a browser screenshot (renderer "browser"). Not part of `bun test`:
// it needs a running Necro (dev server or production) and Clerk's secret key.
//
//   bun --conditions=react-server scripts/shots.ts <origin> <clerkUserId> <outDir> [graveId] [itemId] [postId]
//
// Every sign-in it makes is a one-time ticket and is revoked straight after (see lib/server/screenshot.ts).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_IDS, PAGES, screenshotPages, type PageRequest } from "../lib/server/screenshot";

const [origin, clerkUserId, outDir, graveId, itemId, postId] = process.argv.slice(2);
if (!origin || !clerkUserId || !outDir) {
  console.error("usage: shots.ts <origin> <clerkUserId> <outDir> [graveId] [itemId] [postId]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const requests: PageRequest[] = PAGE_IDS.filter((p) => p !== "public-profile").map((page) => ({ page, graveId, itemId, postId }));
const started = Date.now();
const shots = await screenshotPages({ origin, clerkUserId, publicSlug: null, requests, options: { theme: "light", width: 1280, fullPage: true } });
let failed = 0;
for (const s of shots) {
  if ("error" in s) {
    const needs = "inputs" in PAGES[s.page];
    if (!needs) failed++;
    console.log(`${s.page.padEnd(22)} ${needs ? "skipped" : "FAILED "}  ${s.error}`);
    continue;
  }
  const file = join(outDir, `${s.page}.${s.mimeType === "image/png" ? "png" : "jpg"}`);
  writeFileSync(file, Buffer.from(s.data, "base64"));
  console.log(`${s.page.padEnd(22)} browser  ${s.width}x${s.height}  ${s.path}`);
}
console.log(`${shots.length} pages in ${Math.round((Date.now() - started) / 1000)} s, ${failed} failed`);
process.exit(failed ? 1 : 0);
