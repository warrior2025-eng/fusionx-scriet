import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";

// The public sections, most important first.
const PAGES = [
  "",
  "/about",
  "/programs",
  "/projects",
  "/research",
  "/opportunities",
  "/events",
  "/founders",
  "/teams",
  "/mentors",
  "/resources",
  "/join",
  "/contact",
  "/privacy",
  "/terms",
];

// Served at /sitemap.xml: the public pages, plus each published event.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  // Row level security returns published events only to a signed-out reader.
  const { data: events } = await supabase.from("events").select("id, updated_at").eq("is_published", true);

  return [
    ...PAGES.map((path) => ({ url: `${siteUrl}${path}`, priority: path === "" ? 1 : 0.7 })),
    ...(events ?? []).map((event) => ({
      url: `${siteUrl}/events/${event.id}`,
      lastModified: event.updated_at as string,
      priority: 0.5,
    })),
  ];
}
