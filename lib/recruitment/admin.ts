import type { createClient } from "@/lib/supabase/server";
import { toApplication, type Application, type Stage } from "./data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminApplication = Application & {
  /** One entry per preferred team, in order of preference. */
  teams: { team_id: string; rank: number; stage: Stage; average: number | null; reviews: number; final_note: string | null; interview_at: string | null }[];
};

export type ApplicationFilters = { q?: string; team?: string; rank?: string; stage?: string; department?: string; year?: string; score?: string };

/**
 * Every submitted application of a cycle with its per-team stage and average
 * score. Read with the caller's session, so only admins get anything here.
 */
export async function loadCycleApplications(supabase: Supabase, cycleId: string): Promise<AdminApplication[]> {
  const { data: rows } = await supabase
    .from("recruitment_applications")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(2000);
  const applications = (rows ?? []).map((r) => toApplication(r as Record<string, unknown>));
  if (applications.length === 0) return [];
  const ids = applications.map((a) => a.id);
  const [{ data: statusRows }, { data: reviewRows }] = await Promise.all([
    supabase.from("recruitment_team_status").select("application_id, team_id, rank, stage, final_note, interview_at").in("application_id", ids),
    supabase.from("recruitment_reviews").select("application_id, team_id, score").in("application_id", ids),
  ]);
  const reviews = (reviewRows ?? []) as { application_id: string; team_id: string; score: number | null }[];
  return applications.map((application) => ({
    ...application,
    teams: ((statusRows ?? []) as { application_id: string; team_id: string; rank: number; stage: Stage; final_note: string | null; interview_at: string | null }[])
      .filter((s) => s.application_id === application.id)
      .sort((a, b) => a.rank - b.rank)
      .map((s) => {
        const scores = reviews.filter((r) => r.application_id === application.id && r.team_id === s.team_id && r.score !== null).map((r) => r.score as number);
        return {
          team_id: s.team_id,
          rank: s.rank,
          stage: s.stage,
          final_note: s.final_note,
          interview_at: s.interview_at,
          reviews: scores.length,
          average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        };
      }),
  }));
}

/** The list page and the CSV export filter through this, so they always agree. */
export function filterApplications(applications: AdminApplication[], f: ApplicationFilters): AdminApplication[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const minScore = f.score ? Number(f.score) : null;
  return applications.filter((a) => {
    // With a team chosen, the rank / stage / score filters are about that team.
    const scoped = f.team ? a.teams.filter((t) => t.team_id === f.team) : a.teams;
    if (f.team && scoped.length === 0) return false;
    if (f.rank && !scoped.some((t) => String(t.rank) === f.rank)) return false;
    if (f.stage && !scoped.some((t) => t.stage === f.stage)) return false;
    if (minScore !== null && !scoped.some((t) => t.average !== null && t.average >= minScore)) return false;
    if (f.department && (a.department ?? "").trim().toLowerCase() !== f.department.toLowerCase()) return false;
    if (f.year && (a.year ?? "").trim().toLowerCase() !== f.year.toLowerCase()) return false;
    if (q && ![a.full_name, a.department, a.year].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
}

export const distinct = (values: (string | null)[]) =>
  [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
