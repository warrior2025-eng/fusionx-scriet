import { logAudit } from "@/lib/admin/audit";
import { exportFormat, exportResponse } from "@/lib/admin/export";
import { authorize } from "@/lib/admin/guard";
import { istDateTime } from "@/lib/events/format";
import { filterTeams, loadTeams } from "@/lib/teams/admin";
import { TEAM_STATUS_LABELS, TEAM_TYPE_LABELS, VERIFICATION_LABELS } from "@/lib/teams/data";

/** The teams list as CSV, with the same filters as the page it was opened from. No emails. */
export async function GET(request: Request) {
  const ctx = await authorize("moderation");
  if (!ctx) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const format = exportFormat(url);
  const query = url.searchParams;
  const teams = filterTeams(await loadTeams(ctx.supabase), {
    q: query.get("q") ?? "",
    verification: query.get("verification") ?? "",
    type: query.get("type") ?? "",
    focus: query.get("focus") ?? "",
    status: query.get("status") ?? "",
    looking: query.get("looking") ?? "",
    size: query.get("size") ?? "",
  });
  await logAudit(ctx, { action: "exported", table: "teams", note: `${teams.length} teams to ${format.toUpperCase()}` });

  return exportResponse(format, {
    filename: "fusionx-teams",
    title: "FusionX Teams",
    filters: {
      Search: query.get("q"),
      Verification: query.get("verification"),
      Type: query.get("type"),
      Focus: query.get("focus"),
      Status: query.get("status"),
      "Looking for members": query.get("looking"),
      Size: query.get("size"),
    },
    rows: teams,
    columns: [
      { header: "Team", value: (t) => t.name },
      { header: "Leader", value: (t) => t.leader },
      { header: "Type", value: (t) => TEAM_TYPE_LABELS[t.team_type] },
      { header: "Focus", value: (t) => t.focus },
      { header: "Project", value: (t) => t.project_title },
      { header: "Members", value: (t) => t.size },
      { header: "Team size", value: (t) => t.max_size },
      { header: "Looking for members", value: (t) => (t.looking_for_members ? "Yes" : "No") },
      { header: "Verification", value: (t) => VERIFICATION_LABELS[t.verification_status] },
      { header: "Status", value: (t) => TEAM_STATUS_LABELS[t.status] },
      { header: "Featured", value: (t) => (t.is_featured ? "Yes" : "No") },
      { header: "GitHub", value: (t) => t.github_url },
      { header: "Demo", value: (t) => t.demo_url },
      { header: "Skills", value: (t) => (t.skills_needed ?? []).join(", ") },
      { header: "Registered", value: (t) => istDateTime(t.created_at) },
    ],
  });
}
