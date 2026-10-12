import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { istDateTime } from "@/lib/events/format";
import { filterApplications, loadCycleApplications, type AdminApplication } from "@/lib/recruitment/admin";
import { STAGE_LABELS, answerText, questionsFor, toQuestion } from "@/lib/recruitment/data";

/**
 * One team's applications as CSV, with the same filters as the list it was
 * opened from. Reviewers' private notes are left out unless `notes=1`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const query = new URL(request.url).searchParams;
  const teamId = query.get("team") ?? "";
  const { data: team } = await ctx.supabase.from("recruitment_teams").select("id, name, cycle_id").eq("id", teamId).maybeSingle();
  if (!team || team.cycle_id !== id) return new Response("Choose a team to export.", { status: 400 });
  const withNotes = query.get("notes") === "1";

  const [all, { data: questionRows }, { data: noteRows }] = await Promise.all([
    loadCycleApplications(ctx.supabase, id),
    ctx.supabase.from("recruitment_questions").select("*").eq("cycle_id", id).order("display_order").order("created_at"),
    withNotes ? ctx.supabase.from("recruitment_reviews").select("application_id, private_notes").eq("team_id", teamId) : Promise.resolve({ data: [] }),
  ]);
  const rows = filterApplications(all, {
    q: query.get("q") ?? "",
    team: teamId,
    rank: query.get("rank") ?? "",
    stage: query.get("stage") ?? "",
    department: query.get("department") ?? "",
    year: query.get("year") ?? "",
    score: query.get("score") ?? "",
  });
  const questions = questionsFor((questionRows ?? []).map((q) => toQuestion(q as Record<string, unknown>)), [teamId]).filter((q) => q.type !== "file");
  const notes = (noteRows ?? []) as { application_id: string; private_notes: string | null }[];
  const forTeam = (a: AdminApplication) => a.teams.find((t) => t.team_id === teamId);

  await logAudit(ctx, {
    action: "exported",
    table: "recruitment_applications",
    id,
    note: `${rows.length} applications for ${team.name}${withNotes ? ", with private notes" : ""}`,
  });

  return csvResponse(
    "fusionx-recruitment",
    toCsv(rows, [
      { header: "Team", value: () => String(team.name) },
      { header: "Name", value: (a) => a.full_name },
      { header: "Department", value: (a) => a.department },
      { header: "Year", value: (a) => a.year },
      { header: "Preference", value: (a) => forTeam(a)?.rank ?? "" },
      { header: "Stage", value: (a) => (forTeam(a) ? STAGE_LABELS[forTeam(a)!.stage] : "") },
      { header: "Average score", value: (a) => forTeam(a)?.average?.toFixed(1) ?? "" },
      { header: "Reviews", value: (a) => forTeam(a)?.reviews ?? 0 },
      { header: "Interview", value: (a) => istDateTime(forTeam(a)?.interview_at) },
      { header: "Note to candidate", value: (a) => forTeam(a)?.final_note ?? "" },
      { header: "Submitted", value: (a) => istDateTime(a.submitted_at) },
      { header: "Portfolio", value: (a) => a.links.portfolio ?? "" },
      { header: "GitHub", value: (a) => a.links.github ?? "" },
      { header: "LinkedIn", value: (a) => a.links.linkedin ?? "" },
      ...questions.map((q) => ({ header: q.label, value: (a: AdminApplication) => answerText(a.answers[q.id]) })),
      ...(withNotes
        ? [
            {
              header: "Private notes",
              value: (a: AdminApplication) =>
                notes.filter((n) => n.application_id === a.id && n.private_notes).map((n) => n.private_notes).join(" | "),
            },
          ]
        : []),
    ]),
  );
}
