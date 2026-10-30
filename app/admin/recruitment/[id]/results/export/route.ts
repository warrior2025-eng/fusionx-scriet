import { logAudit } from "@/lib/admin/audit";
import { exportFormat, exportResponse } from "@/lib/admin/export";
import { authorize } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/users";
import { ATTENDANCE_LABELS, DECISION_LABELS, OFFER_LABELS, REASON_LABELS } from "@/lib/recruitment/results";
import { isFinal, loadBoard } from "@/lib/recruitment/results-admin";

/** Final results per hub (or every hub), for staff: includes contact details. Never the WhatsApp link. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const format = exportFormat(url);
  const hubId = url.searchParams.get("hub") ?? "";

  const { teams, rows } = await loadBoard(ctx.supabase, id);
  const hub = teams.find((t) => t.id === hubId);
  const order = new Map(teams.map((t, i) => [t.id, i]));
  const decisionOrder = { selected: 0, waitlisted: 1, not_selected: 2 } as Record<string, number>;
  const chosen = rows
    .filter((r) => !hub || r.team_id === hub.id)
    .sort(
      (a, b) =>
        (order.get(a.team_id) ?? 0) - (order.get(b.team_id) ?? 0) ||
        (decisionOrder[a.stage] ?? 3) - (decisionOrder[b.stage] ?? 3) ||
        (a.waitlist_rank ?? 0) - (b.waitlist_rank ?? 0) ||
        a.name.localeCompare(b.name),
    );
  let emails = new Map<string, string>();
  try {
    emails = new Map((await listUsers(ctx)).map((u) => [u.id, u.email]));
  } catch {
    // Without the service key the email column stays empty; the rest still exports.
  }
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  await logAudit(ctx, { action: "exported", table: "recruitment_team_status", id, note: `${chosen.length} result row(s)${hub ? ` for ${hub.name}` : ""}${format === "pdf" ? " (PDF)" : ""}` });

  // Only the PDF has a heading.
  const { data: cycle } = format === "pdf" ? await ctx.supabase.from("recruitment_cycles").select("title").eq("id", id).maybeSingle() : { data: null };
  return exportResponse(format, {
    filename: `fusionx-results${hub ? `-${hub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`,
    title: `Recruitment results: ${cycle?.title ?? ""}`,
    filters: { Hub: hub?.name ?? "all hubs" },
    rows: chosen,
    columns: [
      { header: "Hub", value: (r) => teamName.get(r.team_id) ?? "" },
      { header: "Name", value: (r) => r.name },
      { header: "Email", value: (r) => emails.get(r.user_id) ?? "" },
      { header: "Department", value: (r) => r.department ?? "" },
      { header: "Year", value: (r) => r.year ?? "" },
      { header: "Choice", value: (r) => String(r.pref_rank) },
      { header: "Interview", value: (r) => ATTENDANCE_LABELS[r.attendance] },
      { header: "Average score", value: (r) => (r.average !== null ? r.average.toFixed(1) : "") },
      { header: "Decision", value: (r) => (isFinal(r.stage) ? DECISION_LABELS[r.stage as "selected"] : "Undecided") },
      { header: "Reason", value: (r) => (r.reason ? REASON_LABELS[r.reason] : "") },
      { header: "Waitlist rank", value: (r) => (r.waitlist_rank ? String(r.waitlist_rank) : "") },
      { header: "Offer", value: (r) => (r.offer_status ? OFFER_LABELS[r.offer_status] : "") },
      { header: "WhatsApp added", value: (r) => (r.stage === "selected" ? (r.whatsapp_added ? "Yes" : "No") : "") },
      { header: "Induction attended", value: (r) => (r.stage === "selected" ? (r.induction_attended ? "Yes" : "No") : "") },
      { header: "Name may be announced", value: (r) => (r.consent ? "Yes" : "No") },
    ],
  });
}
