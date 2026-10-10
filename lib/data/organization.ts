import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationSettings } from "@/types/database";
import { siteName } from "@/lib/site-config";

// Fallback used if the database is unreachable or the settings row is
// missing (e.g. fresh clone, migrations not yet run), and behind any column a
// later migration adds. Mirrors the defaults in the migrations so the site
// renders something truthful rather than throwing.
const FALLBACK_SETTINGS: OrganizationSettings = {
  id: true,
  org_name: "FusionX",
  chapter_name: siteName,
  tagline: "From Ideas to Impact.",
  secondary_tagline: "Don't just participate. Build.",
  faculty_guide_name: "Manav Bansal",
  faculty_guide_title: `Faculty Guide, ${siteName} and HOD, IT, SCRIET`,
  institutional_approval: "faculty_guide_confirmed",
  official_email: null,
  instagram_url: null,
  linkedin_url: null,
  github_url: null,
  announcement_banner: null,
  announcement_banner_active: false,
  subtitle: "Student Innovation & Research Network",
  logo_path: null,
  favicon_path: null,
  og_image_path: null,
  announcement_banner_link: null,
  announcement_banner_starts_at: null,
  announcement_banner_ends_at: null,
  join_open: true,
  join_closed_message: null,
  signup_enabled: true,
  maintenance_mode: false,
  maintenance_message: null,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

/** The organization settings row, fetched once per request. Never throws. */
export const getOrganizationSettings = cache(async (): Promise<OrganizationSettings> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_settings")
      .select("*")
      .eq("id", true)
      .single();

    if (error || !data) return FALLBACK_SETTINGS;

    // Empty required text falls back too, so a cleared field can't blank the site.
    const settings = { ...FALLBACK_SETTINGS, ...data } as OrganizationSettings;
    for (const key of ["chapter_name", "tagline", "subtitle"] as const) {
      if (!settings[key]?.trim()) settings[key] = FALLBACK_SETTINGS[key];
    }
    return settings;
  } catch {
    return FALLBACK_SETTINGS;
  }
});

/** Whether the announcement banner should show right now. */
export function bannerIsLive(settings: OrganizationSettings, now = new Date()): boolean {
  if (!settings.announcement_banner_active || !settings.announcement_banner?.trim()) return false;
  if (settings.announcement_banner_starts_at && new Date(settings.announcement_banner_starts_at) > now) return false;
  if (settings.announcement_banner_ends_at && new Date(settings.announcement_banner_ends_at) < now) return false;
  return true;
}

export function approvalStatusLabel(status: OrganizationSettings["institutional_approval"]) {
  switch (status) {
    case "faculty_guide_confirmed":
      return "Faculty Guide Confirmed, institutional approval process underway";
    case "director_review_pending":
      return "Forwarded for Director review";
    case "officially_approved":
      return "Officially Approved";
  }
}
