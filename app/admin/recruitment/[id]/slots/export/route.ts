import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/users";
import { loadBoard } from "@/lib/recruitment/slot-admin";
import { dayLabel, slotRange } from "@/lib/recruitment/slots";

const STATUS = { booked: "Booked", attended: "Attended", no_show: "No-show" } as const;

/** One interview day as CSV: time, name, email, department, year, team preferences, status. Never the Meet link. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const dayId = new URL(request.url).searchParams.get("day") ?? "";
  const { data: day } = await ctx.supabase.from("recruitment_slot_days").select("id, date, cycle_id").eq("id", dayId).maybeSingle();
  if (!day || day.cycle_id !== id) return new Response("Choose a day to export.", { status: 400 });

  const [board, { data: teamRows }] = await Promise.all([
    loadBoard(ctx.supabase, id),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id),
  ]);
  let emails = new Map<string, string>();
  try {
    emails = new Map((await listUsers(ctx)).map((u) => [u.id, u.email]));
  } catch {
    // Without the service key the email column stays empty; the rest still exports.
  }
  const teamName = Object.fromEntries((teamRows ?? []).map((t) => [t.id as string, t.name as string]));
  const rows = board
    .filter((s) => s.day_id === day.id)
    .flatMap((slot) => slot.bookings.map((booking) => ({ slot, booking })));

  await logAudit(ctx, { action: "exported", table: "recruitment_slot_bookings", id: day.id as string, note: `${rows.length} bookings on ${day.date}` });

  return csvResponse(
    `fusionx-interviews-${day.date}`,
    toCsv(rows, [
      { header: "Date", value: () => dayLabel(String(day.date)) },
      { header: "Time (IST)", value: (r) => slotRange(r.slot.starts_at, r.slot.ends_at) },
      { header: "Name", value: (r) => r.booking.full_name },
      { header: "Email", value: (r) => emails.get(r.booking.user_id) ?? "" },
      { header: "Department", value: (r) => r.booking.department ?? "" },
      { header: "Year", value: (r) => r.booking.year ?? "" },
      { header: "Team preferences", value: (r) => r.booking.preferences.map((t, i) => `${i + 1}. ${teamName[t] ?? "Team"}`).join("; ") },
      { header: "Status", value: (r) => STATUS[r.booking.status] },
    ]),
  );
}
