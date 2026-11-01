import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CoreMember = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  year: string | null;
  bio: string | null;
  title: string;
  is_lead: boolean;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
};

export type CoreTeam = {
  id: string;
  name: string;
  description: string | null;
  kind: "core" | "hub" | "custom";
  members: CoreMember[];
};

type Row = CoreMember & { member_id: string; group_id: string; group_name: string; group_description: string | null; group_kind: CoreTeam["kind"] };

/**
 * The visible teams and their members, in page order, read through the
 * public-safe function (migration 0031). A team with nobody to show is left
 * out, and so is everything if the migration has not been run yet.
 */
export const getCoreTeams = cache(async (): Promise<CoreTeam[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_core_teams");
    if (error || !data) return [];
    const teams = new Map<string, CoreTeam>();
    for (const row of data as Row[]) {
      const team = teams.get(row.group_id) ?? { id: row.group_id, name: row.group_name, description: row.group_description, kind: row.group_kind, members: [] };
      team.members.push({ ...row, id: row.member_id });
      teams.set(row.group_id, team);
    }
    return [...teams.values()];
  } catch {
    return [];
  }
});
