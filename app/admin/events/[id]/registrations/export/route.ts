import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { eventRegistrations, filterRegistrations, type Registration } from "@/lib/admin/registrations";
import { STATUS_LABELS, istDateTime } from "@/lib/events/format";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("content");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const { data: event } = await ctx.supabase.from("events").select("id, title").eq("id", id).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });

  // The same search and status filter as the page it was opened from.
  const query = new URL(request.url).searchParams;
  const registrations = filterRegistrations(await eventRegistrations(ctx, id), {
    q: query.get("q") ?? "",
    status: query.get("status") ?? "",
  });

  await logAudit(ctx, {
    action: "exported",
    table: "event_registrations",
    id,
    note: `${registrations.length} registrations to CSV`,
  });

  return csvResponse(
    "fusionx-event-registrations",
    toCsv(registrations, [
      { header: "Event", value: () => String(event.title) },
      { header: "Name", value: (r) => r.name },
      // Emails only for roles that may view users.
      ...(ctx.caps.includes("users") ? [{ header: "Email", value: (r: Registration) => r.email }] : []),
      { header: "Department", value: (r) => r.department },
      { header: "Year", value: (r) => r.year },
      { header: "Status", value: (r) => STATUS_LABELS[r.status] },
      { header: "Registered", value: (r) => istDateTime(r.registeredAt) },
      { header: "Checked in at", value: (r) => istDateTime(r.checkedInAt) },
      { header: "Certificate serial", value: (r) => r.certificateSerial },
    ]),
  );
}
