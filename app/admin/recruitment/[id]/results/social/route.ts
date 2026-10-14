import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { loadBoard } from "@/lib/recruitment/results-admin";

/**
 * For the Design & Branding hub: the names that may be announced, per hub.
 * Selected and waitlisted candidates who agreed to be named; nothing else
 * (no contact details, scores or notes).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });
  const hubId = new URL(request.url).searchParams.get("hub") ?? "";

  const { teams, rows } = await loadBoard(ctx.supabase, id);
  const hub = teams.find((t) => t.id === hubId);
  const order = new Map(teams.map((t, i) => [t.id, i]));
  const named = rows
    .filter((r) => r.consent && (r.stage === "selected" || r.stage === "waitlisted") && (!hub || r.team_id === hub.id))
    .sort(
      (a, b) =>
        (order.get(a.team_id) ?? 0) - (order.get(b.team_id) ?? 0) ||
        (a.stage === b.stage ? 0 : a.stage === "selected" ? -1 : 1) ||
        (a.waitlist_rank ?? 0) - (b.waitlist_rank ?? 0) ||
        a.name.localeCompare(b.name),
    );
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  await logAudit(ctx, { action: "exported_social", table: "recruitment_team_status", id, note: `${named.length} name(s)${hub ? ` for ${hub.name}` : ""}` });

  return csvResponse(
    `fusionx-results-social${hub ? `-${hub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`,
    toCsv(named, [
      { header: "Name", value: (r) => r.name },
      { header: "Hub", value: (r) => teamName.get(r.team_id) ?? "" },
      { header: "Status", value: (r) => (r.stage === "selected" ? "Selected" : "Waitlist") },
      { header: "Waitlist rank", value: (r) => (r.stage === "waitlisted" && r.waitlist_rank ? String(r.waitlist_rank) : "") },
    ]),
  );
}
