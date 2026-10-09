import { createClient } from "@/lib/supabase/server";
import type { OrganizationSettings } from "@/types/database";
import { siteName } from "@/lib/site-config";

// Fallback used only if the database is unreachable or the settings row is
// missing (e.g. fresh clone, migrations not yet run). Mirrors the defaults
// in the migration so local dev without Supabase configured still renders
// something truthful rather than throwing.
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
  updated_at: new Date().toISOString(),
  updated_by: null,
};

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_settings")
      .select("*")
      .eq("id", true)
      .single();

    if (error || !data) return FALLBACK_SETTINGS;
    return data as OrganizationSettings;
  } catch {
    return FALLBACK_SETTINGS;
  }
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
