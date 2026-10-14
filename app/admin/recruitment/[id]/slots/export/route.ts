import { logAudit } from "@/lib/admin/audit";
import { toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import { loadSlotList, readFilters, type ListSlot, type Seat } from "@/lib/recruitment/slot-list";
import { dayLabel } from "@/lib/recruitment/slots";
import { istDateTime } from "@/lib/events/format";

/**
 * One interview day as CSV (UTF-8 with BOM, so Excel shows every name):
 * filtered by session, booking status and hub, sorted by slot then seat.
 * ?empty=1 gives times and free seats only (no names). Never the Meet link.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorize("recruitment");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const filters = readFilters(url);
  const empty = url.searchParams.get("empty") === "1";
  const list = await loadSlotList(ctx, id, filters, !empty);
  if (!list) return new Response("Choose a day to export.", { status: 400 });

  const date = dayLabel(list.date);
  let body: string;
  if (empty) {
    body = toCsv(list.slots, [
      { header: "Date", value: () => date },
      { header: "Session", value: (s: ListSlot) => s.session },
      { header: "Slot", value: (s: ListSlot) => s.label },
      { header: "Seats", value: (s: ListSlot) => s.capacity },
      { header: "Seats left", value: (s: ListSlot) => Math.max(s.capacity - s.booked, 0) },
    ]);
  } else {
    const rows = list.slots.flatMap((slot) => slot.seats.map((seat) => ({ slot, seat })));
    body = toCsv(rows, [
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
    ]);
  }

  await logAudit(ctx, {
    action: empty ? "exported_empty_schedule" : "exported",
    table: "recruitment_slot_bookings",
    id: filters.day,
    note: `${list.date}${filters.session ? `, ${filters.session}` : ""}${filters.status ? `, ${filters.status}` : ""}${filters.hub ? ", one hub" : ""}`,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fusionx-interview-slots-${empty ? "schedule-" : ""}${list.date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
