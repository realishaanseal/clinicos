import type { MetadataRoute } from "next";
import { APP_PATH, SITE_URL } from "@/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // The app is a signed-in tool, not a page to be found in search.
    rules: { userAgent: "*", allow: "/", disallow: APP_PATH },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
