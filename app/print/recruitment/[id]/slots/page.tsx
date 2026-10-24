import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PrintButton } from "./print-button";
import { logAudit } from "@/lib/admin/audit";
import { requireCapability } from "@/lib/admin/guard";
import { loadSlotList } from "@/lib/recruitment/slot-list";
import { dayLabel } from "@/lib/recruitment/slots";

export const metadata: Metadata = { title: "Interview slots: print", robots: { index: false } };

const STATUS = { booked: "Booked", attended: "Attended", no_show: "No-show", cancelled: "Cancelled" } as Record<string, string>;

/**
 * The printable list for the interview panel (A4 portrait), outside the admin
 * layout so only the list prints. Admins only; every view is logged. Never
 * the Meet link. ?empty=1 prints times and free seats only.
 */
export default async function PrintSlotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/slots`);
  const empty = q.empty === "1";
  const filters = { day: q.day ?? "", session: (q.session ?? "").slice(0, 80), status: q.status ?? "", hub: q.hub ?? "" };
  const list = await loadSlotList(ctx, id, filters, !empty);
  if (!list) notFound();
  await logAudit(ctx, {
    action: empty ? "printed_empty_schedule" : "printed_slot_list",
    table: "recruitment_slot_days",
    id: filters.day,
    note: `${list.date}${filters.session ? `, ${filters.session}` : ""}${filters.status ? `, ${filters.status}` : ""}${filters.hub ? ", one hub" : ""}`,
  });
  const sessions = [...new Set(list.slots.map((s) => s.session))];

  return (
    <main className="print-sheet mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        /* White paper in both themes (the site's dark scrim on <main> must not cover it). */
        .print-sheet { background: #fff !important; }
        .print-sheet, .print-sheet * { color: #000 !important; border-color: #555 !important; }
        .print-sheet table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .print-sheet th, .print-sheet td { border: 1px solid #555; padding: 4px 6px; text-align: left; vertical-align: top; }
        .print-sheet thead { display: table-header-group; }
        .print-sheet .slot { break-inside: avoid; page-break-inside: avoid; }
        .print-sheet .session + .session { break-before: page; page-break-before: always; }
        @media print {
          body { background: #fff !important; }
          body > canvas, .no-print { display: none !important; }
          .print-sheet { max-width: none; padding: 0; }
        }
      `}</style>

      <header className="mb-4 flex items-center gap-3 border-b-2 border-black pb-3">
        <Image src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full" />
        <div className="flex-1">
          <p className="text-base font-bold">FusionX@SCRIET</p>
          <p className="text-sm">
            Interview {empty ? "schedule" : "list"}: {dayLabel(list.date, "long")} (IST){filters.session ? `, ${filters.session}` : ""}
          </p>
        </div>
        <PrintButton />
      </header>

      {list.slots.length === 0 && <p className="text-sm">No slots match.</p>}

      {sessions.map((session) => (
        <section key={session || "none"} className="session">
          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide">{session || "Other"}</h2>
          <table>
            <thead>
              {empty ? (
                <tr>
                  <th style={{ width: "40%" }}>Slot</th>
                  <th>Seats</th>
                  <th>Booked</th>
                  <th>Free</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: "17%" }}>Slot</th>
                  <th style={{ width: "5%" }}>Seat</th>
                  <th style={{ width: "22%" }}>Name</th>
                  <th style={{ width: "16%" }}>Department, year</th>
                  <th style={{ width: "18%" }}>Hubs</th>
                  <th style={{ width: "8%" }}>Attendance</th>
                  <th>Remarks</th>
                </tr>
              )}
            </thead>
            {list.slots
              .filter((s) => s.session === session)
              .map((slot) =>
                empty ? (
                  <tbody key={slot.id} className="slot">
                    <tr>
                      <td>{slot.label}</td>
                      <td>{slot.capacity}</td>
                      <td>{slot.booked}</td>
                      <td>{Math.max(slot.capacity - slot.booked, 0)}</td>
                    </tr>
                  </tbody>
                ) : (
                  <tbody key={slot.id} className="slot">
                    {Array.from({ length: Math.max(slot.capacity, slot.seats.length, 1) }, (_, i) => {
                      const s = slot.seats[i];
                      return (
                        <tr key={i}>
                          {i === 0 && (
                            <td rowSpan={Math.max(slot.capacity, slot.seats.length, 1)} className="font-semibold">
                              {slot.label}
                            </td>
                          )}
                          <td>{s ? s.seat || "" : i + 1}</td>
                          <td>
                            {s ? s.name : "Empty"}
                            {s && s.status !== "booked" && <span> ({STATUS[s.status] ?? s.status})</span>}
                          </td>
                          <td>{s ? [s.department, s.year].filter(Boolean).join(", ") : ""}</td>
                          <td>{s ? [s.hub1, s.hub2].filter(Boolean).map((h, n) => `${n + 1}. ${h}`).join(" ") : ""}</td>
                          <td style={{ textAlign: "center" }}>{s ? "☐" : ""}</td>
                          <td />
                        </tr>
                      );
                    })}
                  </tbody>
                ),
              )}
          </table>
        </section>
      ))}
      <p className="mt-4 text-[10px]">Printed from the FusionX@SCRIET admin panel. Times are India Standard Time.</p>
    </main>
  );
}
