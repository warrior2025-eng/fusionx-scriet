import { listParticipants, removeParticipant, roomConfigured, roomNameForDay, type RoomParticipant } from "@/lib/interview/livekit";
import type { createClient } from "@/lib/supabase/server";

/**
 * The day room's clean-up, on the server: who is in the LiveKit room, who of
 * them may no longer be there (the database decides: their slot is over, not
 * started, the booking is gone, or the day is back on Google Meet), and
 * removing those. The panel stays. Each removal is written down by the
 * database (an integrity event "removed_slot_ended" and an audit entry).
 *
 * Runs with the caller's own session: the panel's screens every 15 seconds and
 * at each slot boundary, the admin's button, and each candidate's join.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fromHex = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** The booking a candidate or phone participant belongs to (from the token's metadata, else its identity). */
export function bookingOf(p: RoomParticipant): { booking: string; who: "candidate" | "phone" } | null {
  if (p.meta?.kind === "panel" || p.identity.startsWith("panel-")) return null;
  if (p.meta?.booking_id && UUID.test(p.meta.booking_id)) return { booking: p.meta.booking_id, who: p.meta.kind === "phone" ? "phone" : "candidate" };
  if (UUID.test(p.identity)) return { booking: p.identity, who: "candidate" };
  if (/^p[0-9a-f]{32}$/i.test(p.identity)) return { booking: fromHex(p.identity.slice(1)), who: "phone" };
  return null;
}

export type EnforceResult = { participants: RoomParticipant[]; removed: number; panel: number; candidates: number; phones: number };

export async function cleanUpDayRoom(supabase: Supabase, dayId: string): Promise<EnforceResult> {
  if (!roomConfigured()) return { participants: [], removed: 0, panel: 0, candidates: 0, phones: 0 };
  const room = roomNameForDay(dayId);
  const participants = await listParticipants(room);
  const people = participants.map((p) => ({ p, b: bookingOf(p) }));
  const bookings = [...new Set(people.flatMap(({ b }) => (b ? [b.booking] : [])))];

  let removed = 0;
  const gone = new Set<string>();
  if (bookings.length) {
    const { data, error } = await supabase.rpc("day_room_overdue", { p_day: dayId, p_bookings: bookings });
    if (error) throw new Error(error.message);
    const overdue = new Set(((data ?? []) as { booking_id: string }[]).map((r) => r.booking_id));
    const out: { booking_id: string; who: "candidate" | "phone" }[] = [];
    for (const { p, b } of people) {
      if (!b || !overdue.has(b.booking)) continue;
      try {
        await removeParticipant(room, p.identity);
        gone.add(p.identity);
        out.push({ booking_id: b.booking, who: b.who });
      } catch {
        // Tried again on the next run (in 15 seconds).
      }
    }
    const { data: n } = await supabase.rpc("record_day_room_removals", { p_day: dayId, p_removed: out });
    removed = Number(n ?? 0);
  } else {
    await supabase.rpc("record_day_room_removals", { p_day: dayId, p_removed: [] });
  }

  const left = participants.filter((p) => !gone.has(p.identity));
  const kinds = left.map((p) => bookingOf(p)?.who ?? "panel");
  return {
    participants: left,
    removed,
    panel: kinds.filter((k) => k === "panel").length,
    candidates: kinds.filter((k) => k === "candidate").length,
    phones: kinds.filter((k) => k === "phone").length,
  };
}
