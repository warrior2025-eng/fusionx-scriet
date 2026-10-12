import type { ReviewRow, TeamStatusRow } from "@/components/recruitment/application-view";
import type { createClient } from "@/lib/supabase/server";
import { toApplication, toQuestion, type Application, type Question } from "./data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ApplicationDetail = {
  application: Application;
  questions: Question[];
  teamNames: Record<string, string>;
  statuses: TeamStatusRow[];
  reviews: ReviewRow[];
  reviewerNames: Record<string, string>;
};

/**
 * Everything the review screen shows for one application, read with the
 * viewer's own session: row level security decides what comes back. A
 * reviewer gets the stage and reviews of their own team only; someone with
 * no right to the application gets null.
 */
export async function loadApplicationDetail(supabase: Supabase, applicationId: string): Promise<ApplicationDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return null;
  const { data: row } = await supabase.from("recruitment_applications").select("*").eq("id", applicationId).maybeSingle();
  if (!row || row.status !== "submitted") return null;
  const application = toApplication(row as Record<string, unknown>);

  const [{ data: questionRows }, { data: teamRows }, { data: statusRows }, { data: reviewRows }] = await Promise.all([
    supabase.from("recruitment_questions").select("*").eq("cycle_id", application.cycle_id).order("display_order").order("created_at"),
    supabase.from("recruitment_teams").select("id, name").eq("cycle_id", application.cycle_id),
    supabase.from("recruitment_team_status").select("*").eq("application_id", applicationId).order("rank"),
    supabase.from("recruitment_reviews").select("team_id, reviewer_id, score, private_notes, updated_at").eq("application_id", applicationId),
  ]);

  const reviews = (reviewRows ?? []) as ReviewRow[];
  const reviewerIds = [...new Set(reviews.map((r) => r.reviewer_id))];
  const { data: people } = reviewerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", reviewerIds)
    : { data: [] as { id: string; full_name: string }[] };

  return {
    application,
    questions: (questionRows ?? []).map((q) => toQuestion(q as Record<string, unknown>)),
    teamNames: Object.fromEntries((teamRows ?? []).map((t) => [t.id as string, t.name as string])),
    statuses: (statusRows ?? []) as TeamStatusRow[],
    reviews,
    reviewerNames: Object.fromEntries((people ?? []).map((p) => [p.id as string, p.full_name as string])),
  };
}
