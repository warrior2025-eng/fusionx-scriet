import { logAudit } from "@/lib/admin/audit";
import { toCsv, type Column } from "@/lib/admin/csv";
import { exportFormat, pdfResponse } from "@/lib/admin/export";
import { authorize } from "@/lib/admin/guard";
import { loadSlotList, readFilters, type ListSlot, type Seat } from "@/lib/recruitment/slot-list";
import { dayLabel } from "@/lib/recruitment/slots";
import { istDateTime } from "@/lib/events/format";

/**
 * One interview day as CSV (UTF-8 with BOM, so Excel shows every name) or PDF:
 * filtered by session, booking status and hub, sorted by slot then seat.
 * ?empty=1 gives times and free seats only (no names). Never the Meet link.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const format = exportFormat(url);
  const filters = readFilters(url);
  const empty = url.searchParams.get("empty") === "1";
  const list = await loadSlotList(ctx, id, filters, !empty);
  if (!list) return new Response("Choose a day to export.", { status: 400 });

  const date = dayLabel(list.date);
  const emptyColumns: Column<ListSlot>[] = [
      { header: "Date", value: () => date },
      { header: "Session", value: (s: ListSlot) => s.session },
      { header: "Slot", value: (s: ListSlot) => s.label },
      { header: "Seats", value: (s: ListSlot) => s.capacity },
      { header: "Seats left", value: (s: ListSlot) => Math.max(s.capacity - s.booked, 0) },
  ];
  const seatRows = list.slots.flatMap((slot) => slot.seats.map((seat) => ({ slot, seat })));
  const seatColumns: Column<{ slot: ListSlot; seat: Seat }>[] = [
      { header: "Date", value: () => date },
      { header: "Slot", value: (r: { slot: ListSlot; seat: Seat }) => r.slot.label },
      { header: "Seat no.", value: (r) => r.seat.seat || "" },
      { header: "Candidate name", value: (r) => r.seat.name },
      { header: "Email", value: (r) => r.seat.email },
      { header: "Department", value: (r) => r.seat.department },
      { header: "Year", value: (r) => r.seat.year },
      { header: "Hub preference 1", value: (r) => r.seat.hub1 },
      { header: "Hub preference 2", value: (r) => r.seat.hub2 },
      { header: "Booking status", value: (r) => r.seat.status },
      { header: "Booked at", value: (r) => istDateTime(r.seat.bookedAt) },
  ];

  await logAudit(ctx, {
    action: empty ? "exported_empty_schedule" : "exported",
    table: "recruitment_slot_bookings",
    id: filters.day,
    note: `${list.date}${filters.session ? `, ${filters.session}` : ""}${filters.status ? `, ${filters.status}` : ""}${filters.hub ? ", one hub" : ""}${format === "pdf" ? " (PDF)" : ""}`,
  });
  if (format === "pdf") {
    const { data: hubRow } = filters.hub ? await ctx.supabase.from("recruitment_teams").select("name").eq("id", filters.hub).maybeSingle() : { data: null };
    const applied = {
      Date: date,
      Session: filters.session,
      "Booking status": filters.status.replace("_", "-"),
      Hub: (hubRow?.name as string | undefined) ?? "",
    };
    const fullName = `fusionx-interview-slots-${empty ? "schedule-" : ""}${list.date}`;
    return empty
      ? pdfResponse({ filename: fullName, title: `Interview schedule: ${dayLabel(list.date, "long")}`, filters: applied, rows: list.slots, columns: emptyColumns }, fullName)
      : pdfResponse({ filename: fullName, title: `Interview slots: ${dayLabel(list.date, "long")}`, filters: applied, rows: seatRows, columns: seatColumns }, fullName);
  }
  const body = empty ? toCsv(list.slots, emptyColumns) : toCsv(seatRows, seatColumns);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fusionx-interview-slots-${empty ? "schedule-" : ""}${list.date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
