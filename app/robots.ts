import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-config";

// Served at /robots.txt. Search engines may read the public pages; the
// signed-in and staff areas have nothing for them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/faculty", "/api/", "/auth/", "/check-in/", "/profile", "/notifications", "/projects/mine", "/research/mine"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
