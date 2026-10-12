import type { createClient } from "@/lib/supabase/server";
import type { Team } from "./data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminTeam = Team & { size: number; leader: string };
export type TeamFilters = { q?: string; verification?: string; type?: string; focus?: string; status?: string; looking?: string; size?: string };

/** Every team with its size and leader's name. Staff only (row level security decides). */
export async function loadTeams(supabase: Supabase): Promise<AdminTeam[]> {
  const { data: rows } = await supabase.from("teams").select("*").order("created_at", { ascending: false }).limit(2000);
  const teams = (rows ?? []) as Team[];
  if (teams.length === 0) return [];
  const [{ data: members }, { data: leaders }] = await Promise.all([
    supabase.from("team_members").select("team_id").in("team_id", teams.map((t) => t.id)),
    supabase.from("profiles").select("id, full_name").in("id", [...new Set(teams.map((t) => t.leader_id))]),
  ]);
  const sizes = new Map<string, number>();
  for (const m of members ?? []) sizes.set(m.team_id as string, (sizes.get(m.team_id as string) ?? 0) + 1);
  const names = new Map((leaders ?? []).map((p) => [p.id as string, p.full_name as string]));
  return teams.map((t) => ({ ...t, size: sizes.get(t.id) ?? 0, leader: names.get(t.leader_id) ?? "" }));
}

/** The list page and the CSV export filter through this, so they always agree. */
export function filterTeams(teams: AdminTeam[], f: TeamFilters): AdminTeam[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return teams.filter((t) => {
    if (f.verification && t.verification_status !== f.verification) return false;
    if (f.type && t.team_type !== f.type) return false;
    if (f.focus && t.focus !== f.focus) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.looking === "yes" && !t.looking_for_members) return false;
    if (f.looking === "no" && t.looking_for_members) return false;
    if (f.size === "1" && t.size !== 1) return false;
    if (f.size === "2-3" && (t.size < 2 || t.size > 3)) return false;
    if (f.size === "4+" && t.size < 4) return false;
    if (q && ![t.name, t.project_title, t.leader, t.focus].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
}
