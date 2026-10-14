import type { createClient } from "@/lib/supabase/server";
import type { Attendance, DecisionReason, OfferStatus, Readiness } from "./results";
import type { Stage } from "./shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The decisions board: every hub of every submitted application with what
 * the admin needs to decide (attendance, scores, reviewer notes). Read with
 * the admin's own session, so row level security decides what comes back.
 */

export type BoardTeam = { id: string; name: string; seats: number | null; display_order: number };

export type BoardRow = {
  application_id: string;
  user_id: string;
  team_id: string;
  name: string;
  department: string | null;
  year: string | null;
  consent: boolean;
  pref_rank: number;
  attendance: Attendance;
  average: number | null;
  reviews: { reviewer: string; score: number | null; notes: string | null }[];
  stage: Stage;
  reason: DecisionReason | null;
  waitlist_rank: number | null;
  final_note: string | null;
  offer_status: OfferStatus | null;
  promoted_at: string | null;
  whatsapp_added: boolean;
  induction_attended: boolean;
  onboarding_notes: string | null;
};

export type ResultsConfig = {
  induction_at: string | null;
  induction_mode: "online" | "in_person" | null;
  induction_link: string | null;
  induction_venue: string | null;
  induction_note: string | null;
  offer_days: number;
  auto_expire: boolean;
};

export const EMPTY_CONFIG: ResultsConfig = {
  induction_at: null,
  induction_mode: null,
  induction_link: null,
  induction_venue: null,
  induction_note: null,
  offer_days: 3,
  auto_expire: false,
};

export async function loadBoard(supabase: Supabase, cycleId: string): Promise<{ teams: BoardTeam[]; rows: BoardRow[] }> {
  const [{ data: teamRows }, { data: appRows }] = await Promise.all([
    supabase.from("recruitment_teams").select("id, name, seats, display_order").eq("cycle_id", cycleId).order("display_order").order("name"),
    supabase
      .from("recruitment_applications")
      .select("id, user_id, full_name, department, year, public_consent")
      .eq("cycle_id", cycleId)
      .eq("status", "submitted")
      .limit(3000),
  ]);
  const teams = (teamRows ?? []) as BoardTeam[];
  type App = { id: string; user_id: string; full_name: string | null; department: string | null; year: string | null; public_consent: boolean | null };
  const apps = new Map(((appRows ?? []) as App[]).map((a) => [a.id, a]));
  const ids = [...apps.keys()];
  if (ids.length === 0) return { teams, rows: [] };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300));
  const read = async <T,>(fn: (part: string[]) => PromiseLike<{ data: unknown }>) =>
    (await Promise.all(chunks.map(async (part) => ((await fn(part)).data ?? []) as T[]))).flat();

  type Status = Omit<BoardRow, "name" | "department" | "year" | "consent" | "user_id" | "attendance" | "average" | "reviews" | "pref_rank" | "reason"> & {
    rank: number;
    decision_reason: DecisionReason | null;
  };
  const [statuses, reviews, bookings] = await Promise.all([
    read<Status>((part) =>
      supabase
        .from("recruitment_team_status")
        .select("application_id, team_id, rank, stage, decision_reason, waitlist_rank, final_note, offer_status, promoted_at, whatsapp_added, induction_attended, onboarding_notes")
        .in("application_id", part),
    ),
    read<{ application_id: string; team_id: string; reviewer_id: string; score: number | null; private_notes: string | null }>((part) =>
      supabase.from("recruitment_reviews").select("application_id, team_id, reviewer_id, score, private_notes").in("application_id", part),
    ),
    read<{ application_id: string; status: string }>((part) =>
      supabase.from("recruitment_slot_bookings").select("application_id, status").in("application_id", part).neq("status", "cancelled"),
    ),
  ]);

  const reviewerIds = [...new Set(reviews.map((r) => r.reviewer_id))];
  const { data: people } = reviewerIds.length ? await supabase.from("profiles").select("id, full_name").in("id", reviewerIds) : { data: [] };
  const reviewerName = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const attendance = new Map(
    bookings.map((b) => [b.application_id, (b.status === "attended" ? "attended" : b.status === "no_show" ? "no_show" : "booked") as Attendance]),
  );

  const rows: BoardRow[] = statuses
    .filter((s) => apps.has(s.application_id))
    .map((s) => {
      const a = apps.get(s.application_id)!;
      const mine = reviews.filter((r) => r.application_id === s.application_id && r.team_id === s.team_id);
      const scores = mine.filter((r) => r.score !== null).map((r) => r.score as number);
      return {
        application_id: s.application_id,
        user_id: a.user_id,
        team_id: s.team_id,
        name: a.full_name?.trim() || "Candidate",
        department: a.department,
        year: a.year,
        consent: a.public_consent === true,
        pref_rank: s.rank,
        attendance: attendance.get(s.application_id) ?? "none",
        average: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
        reviews: mine.map((r) => ({ reviewer: reviewerName.get(r.reviewer_id) ?? "Reviewer", score: r.score, notes: r.private_notes })),
        stage: s.stage,
        reason: s.decision_reason,
        waitlist_rank: s.waitlist_rank,
        final_note: s.final_note,
        offer_status: s.offer_status,
        promoted_at: s.promoted_at,
        whatsapp_added: s.whatsapp_added === true,
        induction_attended: s.induction_attended === true,
        onboarding_notes: s.onboarding_notes,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
  return { teams, rows };
}

export async function loadReadiness(supabase: Supabase, cycleId: string): Promise<Readiness | null> {
  const { data, error } = await supabase.rpc("results_readiness", { p_cycle: cycleId });
  return error || !data ? null : (data as Readiness);
}

export async function loadConfig(supabase: Supabase, cycleId: string): Promise<ResultsConfig> {
  const { data } = await supabase.from("recruitment_results_config").select("*").eq("cycle_id", cycleId).maybeSingle();
  return data ? ({ ...EMPTY_CONFIG, ...(data as Partial<ResultsConfig>) } as ResultsConfig) : EMPTY_CONFIG;
}

export const isFinal = (stage: Stage) => stage === "selected" || stage === "waitlisted" || stage === "not_selected";
