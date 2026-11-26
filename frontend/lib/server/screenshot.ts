import "server-only";
import { existsSync } from "node:fs";
import { createClerkClient } from "@clerk/backend";
import type { Browser, Page as PuppeteerPage } from "puppeteer-core";

// screenshot_page: a REAL screenshot of one of the user's own Necro pages, exactly as they would see it.
//
// How it stays safe:
// - Necro's server opens a fresh, private headless browser (nothing shared between calls, nothing stored).
// - It signs that browser in as the user with a Clerk sign-in token: single use, valid 60 seconds, minted here.
// - It only loads Necro pages on this same origin, never clicks or types, takes the picture, then revokes that
//   session through Clerk's API and closes the browser. Only the image leaves; the session never does.
// - The MCP route checks the key, the rate limit and writes the audit row first (mcpWrite.screenshotGrant).

/** The pages an assistant may photograph, and where they live. */
export const SCREENSHOT_PAGES = {
  dashboard: { path: "/dashboard", label: "Home overview" },
  crypt: { path: "/crypt", label: "Crypt (reader)" },
  graveyard: { path: "/graveyard", label: "Graveyard (feeds and Feed Doctor)" },
  calendar: { path: "/calendar", label: "Witching Hour (posts calendar)" },
  omens: { path: "/omens", label: "Omens and Grimoire" },
  circle: { path: "/circle", label: "The Circle" },
  discover: { path: "/discover", label: "Discover" },
  settings: { path: "/settings", label: "Settings" },
  profile: { path: "/settings", label: "Profile (in Settings)", section: "profile" },
  public_profile: { path: "/circle/", label: "Your public Circle profile" },
  docs: { path: "/docs", label: "Docs" },
} as const;
export type ScreenshotPage = keyof typeof SCREENSHOT_PAGES;
export const SCREENSHOT_PAGE_NAMES = Object.keys(SCREENSHOT_PAGES) as [ScreenshotPage, ...ScreenshotPage[]];

/** Clerk's server API (the same package @clerk/nextjs uses), so this also runs outside a Next.js request. */
function clerkApi() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  return createClerkClient({ secretKey });
}

const WIDTH = 1280;
const HEIGHT = 900;
const MAX_FULL_HEIGHT = 4000;

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

/** Waits until the page's live data has arrived: no loading skeletons, and the text has stopped changing. */
async function settle(page: PuppeteerPage, timeoutMs = 12_000) {
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

export type Shot = { data: string; mimeType: "image/png" | "image/jpeg"; width: number; height: number; url: string };

/**
 * Signs a private headless browser in as the user (Clerk sign-in token), opens one Necro page, and returns its
 * screenshot. `section` scrolls to an anchor on the page (e.g. "connections" in Settings) and photographs from there.
 */
export async function screenshotAs(opts: {
  origin: string;
  clerkUserId: string;
  page: ScreenshotPage;
  section?: string;
  publicSlug?: string | null;
  fullPage?: boolean;
}): Promise<Shot> {
  const def = SCREENSHOT_PAGES[opts.page];
  let path: string = def.path;
  if (opts.page === "public_profile") {
    if (!opts.publicSlug) throw Object.assign(new Error("no public profile"), { data: { code: "NOT_FOUND", message: "You have no public Circle profile yet. Turn it on in Settings → Profile." } });
    path = `/circle/${encodeURIComponent(opts.publicSlug)}`;
  }
  const section = opts.section ?? ("section" in def ? def.section : undefined);
  const target = new URL(path, opts.origin);

  const clerk = clerkApi();
  const { token } = await clerk.signInTokens.createSignInToken({ userId: opts.clerkUserId, expiresInSeconds: 60 });

  const browser = await launch();
  let sessionId: string | null = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    // Never leave this Necro: the main frame may only go to Necro itself and Clerk's own sign-in handshake
    // (accounts.dev in development, clerk.<site> / accounts.<site> in production). Resources load normally.
    const site = target.hostname.split(".").slice(-2).join(".");
    const allowedNav = (u: URL) =>
      u.origin === target.origin ||
      u.hostname.endsWith(".accounts.dev") ||
      u.hostname === `clerk.${site}` ||
      u.hostname === `accounts.${site}`;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !allowedNav(new URL(req.url()))) void req.abort();
      else void req.continue();
    });

    // 1. Sign in with the one-time ticket (Clerk's own client, on Necro's sign-in page).
    await page.goto(new URL("/sign-in", opts.origin).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
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

    // 2. Open the page and wait for its live data.
    await page.goto(target.toString(), { waitUntil: "networkidle2", timeout: 30_000 }).catch(() => undefined);
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }" }).catch(() => undefined);
    await settle(page);

    let clipTop = 0;
    if (section && /^[a-z0-9-]{1,40}$/.test(section)) {
      clipTop = await page.evaluate((id: string) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        return Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90); // keep the sticky header out of the way
      }, section);
      await page.evaluate((y: number) => window.scrollTo(0, y), clipTop);
      await settle(page, 3000);
    }

    if (opts.fullPage) {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const height = Math.min(Math.max(total - clipTop, HEIGHT), MAX_FULL_HEIGHT);
      await page.evaluate(() => window.scrollTo(0, 0));
      const bytes = await page.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: clipTop, width: WIDTH, height }, captureBeyondViewport: true });
      return { data: Buffer.from(bytes).toString("base64"), mimeType: "image/jpeg", width: WIDTH, height, url: target.pathname };
    }
    const bytes = await page.screenshot({ type: "png" });
    return { data: Buffer.from(bytes).toString("base64"), mimeType: "image/png", width: WIDTH, height: HEIGHT, url: target.pathname };
  } finally {
    // 3. End that session for good, whatever happened, then throw the browser away.
    if (sessionId) await clerk.sessions.revokeSession(sessionId).catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
