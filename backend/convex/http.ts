// Public HTTP endpoints on the Convex site URL.
//   GET /c/<slug>.opml          a collection as OPML 2.0 (import into any feed reader)
//   GET /c/<slug>/starred.xml   RSS 2.0 of the curator's starred posts (only if they opted in)
// Only public or unlisted, non-hidden collections are served. No private data beyond what the curator published.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { exportOpml } from "../lib/feeds/opml";

const http = httpRouter();

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
const cacheHeaders = { "cache-control": "public, max-age=600", "access-control-allow-origin": "*" };

http.route({
  pathPrefix: "/c/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const path = new URL(req.url).pathname.slice("/c/".length);
    const opml = path.match(/^([a-z0-9-]{3,40})\.opml$/);
    const rss = path.match(/^([a-z0-9-]{3,40})\/starred\.xml$/);
    const slug = opml?.[1] ?? rss?.[1];
    if (!slug) return notFound();

    const c = await ctx.runQuery(internal.covens.publicFeed, { slug });
    if (!c) return notFound();

    if (opml) {
      const body = exportOpml(
        c.feeds.map((f) => ({ title: f.title, feedUrl: f.feedUrl, siteUrl: f.siteUrl ?? null, folder: null })),
        c.curator,
      ).replace("<title>Necro subscriptions</title>", `<title>${esc(c.title)}</title>`);
      return new Response(body, { headers: { "content-type": "text/x-opml; charset=utf-8", ...cacheHeaders } });
    }

    if (!c.starredFeed) return notFound();
    const items = c.starred
      .map(
        (i) => `    <item>
      <title>${esc(i.title)}</title>
      ${i.link ? `<link>${esc(i.link)}</link>\n      <guid isPermaLink="true">${esc(i.link)}</guid>` : ""}
      <description>${esc(i.excerpt)}</description>
      <pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>
    </item>`,
      )
      .join("\n");
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(c.title)} — starred by ${esc(c.curator)}</title>
    <link>https://necro.malitos.tech/discover</link>
    <description>${esc(c.description || "Posts starred in Necro.")}</description>
    <lastBuildDate>${new Date(c.updatedAt).toUTCString()}</lastBuildDate>
    <generator>Necro</generator>
${items}
  </channel>
</rss>
`;
    return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", ...cacheHeaders } });
  }),
});

export default http;
