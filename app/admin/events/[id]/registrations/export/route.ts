import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { eventRegistrations } from "@/lib/admin/registrations";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("content");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const { data: event } = await ctx.supabase.from("events").select("id, title").eq("id", id).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });

  const registrations = await eventRegistrations(ctx, id);
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
      ...(ctx.caps.includes("users") ? [{ header: "Email", value: (r: (typeof registrations)[number]) => r.email }] : []),
      { header: "Department", value: (r) => r.department },
      { header: "Year", value: (r) => r.year },
      { header: "Registered", value: (r) => r.registeredAt },
    ]),
  );
}
