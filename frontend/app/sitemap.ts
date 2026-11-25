import type { MetadataRoute } from "next";
import { site } from "@/lib/copy";

/** The public pages search engines should know about. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/docs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site.url}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site.url}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
