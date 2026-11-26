import "server-only";
import { existsSync } from "node:fs";
import { createClerkClient } from "@clerk/backend";
import type { Browser, Page as PuppeteerPage } from "puppeteer-core";

// get_page_image: REAL screenshots of the user's own Necro pages, exactly as they see them signed in.
//
// How it stays safe:
// - Necro's server opens a fresh, private headless browser (nothing shared between calls, nothing stored).
// - It signs that browser in as the user with a Clerk sign-in token: single use, valid 60 seconds, minted here.
//   Never the user's own session cookie.
// - It only loads Necro pages on this same origin, never clicks or types, masks every API key on the page,
//   takes the pictures, then revokes that session through Clerk's API and closes the browser.
// - The MCP route checks the key, the rate limit and writes the audit row first (mcpWrite.screenshotGrant).

export type PageInput = "graveId" | "itemId" | "postId";
export type PageDef = { title: string; path: string; inputs?: PageInput[]; section?: string; query?: Record<string, string>; about: string };

/** Every page a signed-in user can open, by id. `inputs` are the ids the page needs. */
export const PAGES = {
  dashboard: { title: "Home overview", path: "/dashboard", about: "Stats, Activity chart, MCP calls chart, up next, recently posted, read next, accounts, setup" },
  analytics: { title: "Charts (Home activity)", path: "/dashboard", section: "activity", about: "The Activity line chart (new articles, posts, AI uses, MCP calls) and the MCP calls bar chart" },
  setup: { title: "Setup checklist", path: "/dashboard", section: "checklist-title", about: "The setup steps on Home (only shown until they are all done)" },
  feeds: { title: "Graveyard (all feeds)", path: "/graveyard", about: "Every feed with status, unread count and folders" },
  "feed-doctor": { title: "Feed Doctor", path: "/graveyard", query: { tab: "doctor" }, about: "Broken and sleeping feeds with fixes" },
  feed: { title: "One feed's articles", path: "/crypt", inputs: ["graveId"], about: "The Crypt filtered to one feed" },
  articles: { title: "Crypt (all articles)", path: "/crypt", about: "The reader: article list and reading pane" },
  "articles-unread": { title: "Unread articles", path: "/crypt", query: { filter: "unread" }, about: "The Crypt, unread only" },
  "articles-starred": { title: "Starred articles", path: "/crypt", query: { filter: "starred" }, about: "The Crypt, starred only" },
  article: { title: "One article (with its Séance)", path: "/crypt", inputs: ["itemId"], about: "Reading pane: the article, its Séance summary and score, Kindred and post drafts" },
  omens: { title: "Omens (topic alerts)", path: "/omens", about: "Watched topics and matching articles" },
  grimoire: { title: "Grimoire (newsletter)", path: "/omens", query: { tab: "grimoire" }, about: "Weekly newsletter drafts" },
  calendar: { title: "Witching Hour (posts calendar)", path: "/calendar", about: "Scheduled, due and posted posts on a calendar" },
  composer: { title: "New post (composer)", path: "/calendar", query: { compose: "1" }, about: "The New post composer, empty" },
  "post-preview": { title: "Post preview", path: "/calendar/preview", inputs: ["postId"], about: "Exactly how a draft or scheduled post will look on each platform" },
  circle: { title: "The Circle", path: "/circle", about: "People you follow and their posts" },
  "public-profile": { title: "Your public Circle profile", path: "/circle/", about: "Your profile as others see it (when public)" },
  discover: { title: "Discover", path: "/discover", about: "Shared feed collections" },
  settings: { title: "Settings (all)", path: "/settings", about: "Every Settings section" },
  "settings-profile": { title: "Settings: Profile", path: "/settings", section: "profile", about: "Display name, interests, language, timezone" },
  "settings-connections": { title: "Settings: Connected accounts", path: "/settings", section: "connections", about: "LinkedIn, X, Instagram, TikTok" },
  "settings-voice": { title: "Settings: Voice", path: "/settings", section: "voice", about: "Tone, audience, words, sample posts" },
  "settings-learning": { title: "Settings: Learning", path: "/settings", section: "learning", about: "What Necro learned from your reading" },
  "settings-privacy": { title: "Settings: Privacy", path: "/settings", section: "privacy", about: "Private mode" },
  "settings-keys": { title: "Settings: MCP keys and connected apps", path: "/settings", section: "keys", about: "Keys, apps, scopes and the MCP activity log (key values are masked)" },
  "settings-usage": { title: "Settings: Usage and export", path: "/settings", section: "usage", about: "Daily AI limits used, OPML export" },
  "settings-data": { title: "Settings: Your data", path: "/settings", section: "data", about: "Export and delete your account" },
  docs: { title: "Docs", path: "/docs", about: "Necro's documentation" },
} as const satisfies Record<string, PageDef>;

export type PageId = keyof typeof PAGES;
export const PAGE_IDS = Object.keys(PAGES) as [PageId, ...PageId[]];

export type PageRequest = { page: PageId; graveId?: string; itemId?: string; postId?: string; section?: string };
export type ShotOptions = { theme: "light" | "dark"; width: number; fullPage: boolean };
export type Shot = { page: PageId; data: string; mimeType: "image/png" | "image/jpeg"; width: number; height: number; path: string };

const ID_RE = /^[a-z0-9]{10,64}$/i;

/** The URL for one page request, or a short reason it can't be built. */
export function pageUrl(origin: string, r: PageRequest, publicSlug: string | null): { url: URL; section?: string } | { error: string } {
  const def: PageDef = PAGES[r.page];
  for (const need of def.inputs ?? []) {
    const v = r[need];
    if (!v) return { error: `Page '${r.page}' needs ${need}.` };
    if (!ID_RE.test(v)) return { error: `${need} does not look like a Necro id.` };
  }
  let path = def.path;
  if (r.page === "public-profile") {
    if (!publicSlug) return { error: "You have no public Circle profile yet. Turn it on in Settings → Profile." };
    path = `/circle/${encodeURIComponent(publicSlug)}`;
  }
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(def.query ?? {})) url.searchParams.set(k, v);
  if (r.graveId) url.searchParams.set("grave", r.graveId);
  if (r.itemId) url.searchParams.set("item", r.itemId);
  if (r.postId) url.searchParams.set("post", r.postId);
  return { url, section: r.section ?? def.section };
}

function clerkApi() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  return createClerkClient({ secretKey });
}

/** The user's avatar URL from Clerk (for get_profile). Null when Clerk can't be reached. */
export async function avatarOf(clerkUserId: string): Promise<string | null> {
  try {
    return (await clerkApi().users.getUser(clerkUserId)).imageUrl ?? null;
  } catch {
    return null;
  }
}

const HEIGHT = 900;
const MAX_FULL_HEIGHT = 8000;

async function launch(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
  }
  // Local development: a Chrome or Edge already installed (or CHROME_EXECUTABLE_PATH).
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((p): p is string => !!p);
  const executablePath = candidates.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome found for screenshots. Set CHROME_EXECUTABLE_PATH.");
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
}

/** Waits until live data and charts are in: no loading skeletons, charts drawn, and the text has stopped changing. */
async function settle(page: PuppeteerPage, timeoutMs = 15_000) {
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { __necroLast?: string; __necroSince?: number };
        const busy = document.querySelector('[aria-busy="true"], .animate-pulse');
        const text = document.body?.innerText ?? "";
        const now = Date.now();
        if (w.__necroLast !== text || busy) {
          w.__necroLast = text;
          w.__necroSince = now;
          return false;
        }
        return now - (w.__necroSince ?? now) > 900;
      },
      { timeout: timeoutMs, polling: 250 },
    )
    .catch(() => undefined); // take the picture anyway after the timeout
}

/** Replaces every Necro API key or token on the page with a masked one (text and form fields). Only keys are hidden. */
async function maskKeys(page: PuppeteerPage) {
  await page.evaluate(() => {
    const re = /necro_(sk|at|rt)_[A-Za-z0-9_-]{4,}…?/g;
    const has = (s: string) => /necro_(sk|at|rt)_[A-Za-z0-9_-]{4,}/.test(s); // no /g: .test must not keep state
    const mask = (s: string) => s.replace(re, (_m, kind: string) => `necro_${kind}_••••••••`);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue && has(n.nodeValue)) n.nodeValue = mask(n.nodeValue);
    for (const el of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) if (has(el.value)) el.value = mask(el.value);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-secret]"))) el.style.filter = "blur(6px)";
  });
}

/**
 * Signs ONE private headless browser in as the user and photographs each requested page in turn.
 * Pages that fail are returned as { page, error } so one bad page never hides the others.
 */
export async function screenshotPages(opts: {
  origin: string;
  clerkUserId: string;
  publicSlug: string | null;
  requests: PageRequest[];
  options: ShotOptions;
}): Promise<(Shot | { page: PageId; error: string })[]> {
  const { origin, options } = opts;
  const width = Math.min(Math.max(Math.round(options.width), 360), 1920);
  const clerk = clerkApi();
  const { token } = await clerk.signInTokens.createSignInToken({ userId: opts.clerkUserId, expiresInSeconds: 60 });

  const browser = await launch();
  let sessionId: string | null = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: HEIGHT, deviceScaleFactor: 1 });
    // The page's own theme switch (ThemeToggle.tsx) and no motion, so charts are drawn at once.
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: options.theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.evaluateOnNewDocument((theme: string) => {
      try {
        localStorage.setItem("necro.theme", theme);
      } catch {}
    }, options.theme);
    // Never leave this Necro: the main frame may only go to Necro itself and Clerk's own sign-in handshake.
    const target = new URL(origin);
    const site = target.hostname.split(".").slice(-2).join(".");
    const allowedNav = (u: URL) => u.origin === target.origin || u.hostname.endsWith(".accounts.dev") || u.hostname === `clerk.${site}` || u.hostname === `accounts.${site}`;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !allowedNav(new URL(req.url()))) void req.abort();
      else void req.continue();
    });

    // 1. Sign in once with the one-time ticket (Clerk's own client, on Necro's sign-in page).
    await page.goto(new URL("/sign-in", origin).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => !!(window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded, { timeout: 20_000 });
    sessionId = await page.evaluate(async (ticket: string) => {
      const C = (window as unknown as {
        Clerk: {
          client: { signIn: { create: (p: { strategy: "ticket"; ticket: string }) => Promise<{ status: string; createdSessionId: string | null }> } };
          setActive: (p: { session: string | null }) => Promise<void>;
        };
      }).Clerk;
      const si = await C.client.signIn.create({ strategy: "ticket", ticket });
      if (si.status !== "complete" || !si.createdSessionId) throw new Error(`sign-in ${si.status}`);
      await C.setActive({ session: si.createdSessionId });
      return si.createdSessionId;
    }, token);

    // 2. Each page: open, wait for data and charts, mask keys, photograph.
    const out: (Shot | { page: PageId; error: string })[] = [];
    for (const r of opts.requests) {
      const built = pageUrl(origin, r, opts.publicSlug);
      if ("error" in built) {
        out.push({ page: r.page, error: built.error });
        continue;
      }
      try {
        await page.goto(built.url.toString(), { waitUntil: "networkidle2", timeout: 30_000 }).catch(() => undefined);
        await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }" }).catch(() => undefined);
        await settle(page);
        // Charts draw once their card has a width (Charts.tsx, ResizeObserver): give them up to 3 s more.
        await page.waitForFunction(() => Array.from(document.querySelectorAll("[style*='height']")).every((d) => !d.closest("section") || d.querySelector("svg") || !d.parentElement?.querySelector("h2")), { timeout: 3000 }).catch(() => undefined);
        let clipTop = 0;
        if (built.section && /^[a-z0-9-]{1,40}$/.test(built.section)) {
          clipTop = await page.evaluate((id: string) => {
            const el = document.getElementById(id);
            return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90) : 0; // keep the sticky header clear
          }, built.section);
          await page.evaluate((y: number) => window.scrollTo(0, y), clipTop);
          await settle(page, 3000);
        }
        await maskKeys(page);
        const path = built.url.pathname + built.url.search;
        if (options.fullPage) {
          const total = await page.evaluate(() => document.documentElement.scrollHeight);
          const height = Math.min(Math.max(total - clipTop, HEIGHT), MAX_FULL_HEIGHT);
          await page.evaluate(() => window.scrollTo(0, 0));
          const bytes = await page.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: clipTop, width, height }, captureBeyondViewport: true });
          out.push({ page: r.page, data: Buffer.from(bytes).toString("base64"), mimeType: "image/jpeg", width, height, path });
        } else {
          const bytes = await page.screenshot({ type: "png" });
          out.push({ page: r.page, data: Buffer.from(bytes).toString("base64"), mimeType: "image/png", width, height: HEIGHT, path });
        }
      } catch (e) {
        console.error(JSON.stringify({ ev: "screenshot", page: r.page, error: String(e).slice(0, 200) })); // server log only
        out.push({ page: r.page, error: "This page could not be photographed right now." });
      }
    }
    return out;
  } finally {
    // 3. End that session for good, whatever happened, then throw the browser away.
    if (sessionId) await clerk.sessions.revokeSession(sessionId).catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
