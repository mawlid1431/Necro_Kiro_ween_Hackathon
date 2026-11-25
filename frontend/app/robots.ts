import type { MetadataRoute } from "next";
import { site } from "@/lib/copy";

/** Public pages may be indexed; the signed-in app, APIs and OAuth endpoints may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs", "/privacy", "/terms"],
      disallow: ["/api/", "/oauth/", "/dashboard", "/settings", "/calendar", "/crypt", "/graveyard", "/discover", "/omens", "/circle", "/connectors/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
