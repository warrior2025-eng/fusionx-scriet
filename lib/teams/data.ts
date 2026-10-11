import { getContent } from "@/lib/data/site-content";
import { isPast } from "@/lib/events/format";
import { createClient } from "@/lib/supabase/server";
import type { TeamStatus } from "@/types/database";

/** FusionX Teams: the shapes the pages share and the settings behind them. */

export type Verification = "pending" | "verified" | "rejected";

export type Team = {
  id: string;
  name: string;
  description: string | null;
  skills_needed: string[];
  status: TeamStatus;
  created_by: string;
  created_at: string;
  team_type: "existing" | "new";
  focus: string | null;
  project_title: string | null;
  project_summary: string | null;
  github_url: string | null;
  demo_url: string | null;
  looking_for_members: boolean;
  max_size: number | null;
  verification_status: Verification;
  verified_at: string | null;
  leader_id: string;
  is_featured: boolean;
};

export type RosterMember = { user_id: string; full_name: string; department: string | null; year: string | null; role: string; joined_at: string };

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  forming: "Forming",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};
export const VERIFICATION_LABELS: Record<Verification, string> = {
  pending: "Awaiting verification",
  verified: "Verified",
  rejected: "Not verified",
};
export const VERIFICATION_TONE: Record<Verification, "neutral" | "good" | "warn" | "bad"> = {
  pending: "warn",
  verified: "good",
  rejected: "bad",
};
export const TEAM_TYPE_LABELS = { existing: "Existing team", new: "New team" } as const;

/** The limits and the registration switch, as set in the admin panel. */
export async function getTeamSettings() {
  const settings = await getContent("teams.settings");
  return { ...settings, open: settings.registrationOpen && !isPast(settings.deadline) };
}

export async function getFocusCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("team_focus_categories").select("name").eq("is_visible", true).order("display_order").order("name");
  return (data ?? []).map((c) => c.name as string);
}

/** Emails from a textarea: split on commas, spaces and new lines; lower-cased; no duplicates. */
export function parseEmails(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}
