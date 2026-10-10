import type { Metadata } from "next";
import { getContent } from "@/lib/data/site-content";
import type { SeoPageKey } from "@/lib/site-content/schema";

/**
 * Metadata for one of the main pages: what the admin panel set for it, with
 * the page's own built-in title and description behind each field.
 */
export async function pageMetadata(
  page: SeoPageKey,
  fallback: { title?: string; description?: string },
): Promise<Metadata> {
  const pages = await getContent("seo.pages");
  const custom = pages[page] ?? {};
  const title = custom.title?.trim() || fallback.title;
  const description = custom.description?.trim() || fallback.description;
  const image = custom.ogImage?.trim();

  return {
    // The home page's title stands alone; every other page goes through the template.
    ...(title ? { title: page === "home" ? { absolute: title } : title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { openGraph: { images: [image] }, twitter: { images: [image] } } : {}),
  };
}
