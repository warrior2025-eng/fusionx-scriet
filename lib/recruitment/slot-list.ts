import type { AdminContext } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/users";
import { slotRange, toSessions, type Session } from "./slots";

/**
 * One interview day as a list, for the CSV and the printable view: every slot
 * with its seats, filtered by session, booking status and hub. Read with the
 * admin's own session. Never the Meet link, never private notes.
 */

export type ListFilters = { day: string; session: string; status: string; hub: string };
export type Seat = {
  seat: number;
  name: string;
  email: string;
  department: string;
  year: string;
  hub1: string;
  hub2: string;
  status: string;
  bookedAt: string;
};
export type ListSlot = { id: string; startsAt: string; endsAt: string; label: string; session: string; capacity: number; booked: number; seats: Seat[] };

export const STATUSES = ["booked", "attended", "no_show", "cancelled"] as const;

export function readFilters(url: URL): ListFilters {
  const get = (k: string) => (url.searchParams.get(k) ?? "").trim().slice(0, 80);
  return { day: get("day"), session: get("session"), status: get("status"), hub: get("hub") };
}

/** Which session a slot belongs to, from the IST clock time of its start. */
function sessionOf(sessions: Session[], startsAt: string): string {
  const hhmm = new Date(startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return sessions.find((s) => hhmm >= s.start && hhmm < s.end)?.label ?? "";
}

export async function loadSlotList(ctx: AdminContext, cycleId: string, f: ListFilters, withPeople: boolean) {
  const { data: day } = await ctx.supabase.from("recruitment_slot_days").select("id, cycle_id, date, sessions").eq("id", f.day).maybeSingle();
  if (!day || day.cycle_id !== cycleId) return null;
  const sessions = toSessions(day.sessions);

  const [{ data: slotRows }, { data: bookingRows }, { data: teamRows }] = await Promise.all([
    ctx.supabase.from("recruitment_slots").select("id, starts_at, ends_at, capacity, is_blocked").eq("day_id", day.id).order("starts_at"),
    ctx.supabase
      .from("recruitment_slot_bookings")
      .select("id, slot_id, user_id, status, created_at, recruitment_applications(full_name, department, year, preferences), recruitment_slots!inner(day_id)")
      .eq("recruitment_slots.day_id", day.id)
      .order("created_at"),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", cycleId),
  ]);
  const team = new Map(((teamRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  type B = {
    slot_id: string;
    user_id: string;
    status: string;
    created_at: string;
    recruitment_applications: { full_name: string | null; department: string | null; year: string | null; preferences: string[] | null } | null;
  };
  const bookings = (bookingRows ?? []) as unknown as B[];

  let emails = new Map<string, string>();
  if (withPeople) {
    try {
      emails = new Map((await listUsers(ctx)).map((u) => [u.id, u.email]));
    } catch {
      // Without the service key the email column stays empty; the rest still works.
    }
  }

  const slots: ListSlot[] = ((slotRows ?? []) as { id: string; starts_at: string; ends_at: string; capacity: number; is_blocked: boolean }[])
    .map((s) => {
      const live = bookings.filter((b) => b.slot_id === s.id && b.status !== "cancelled");
      // Seat numbers follow booking order among the live bookings; cancelled ones are listed after, without a seat.
      const numbered = new Map(live.map((b, i) => [b, i + 1]));
      const shown = bookings
        .filter((b) => b.slot_id === s.id)
        .filter((b) => (f.status ? b.status === f.status : b.status !== "cancelled"))
        .filter((b) => !f.hub || (b.recruitment_applications?.preferences ?? []).includes(f.hub));
      return {
        id: s.id,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        label: slotRange(s.starts_at, s.ends_at),
        session: sessionOf(sessions, s.starts_at),
        capacity: s.is_blocked ? 0 : s.capacity,
        booked: live.length,
        seats: withPeople
          ? shown.map((b) => {
              const a = b.recruitment_applications;
              const prefs = a?.preferences ?? [];
              return {
                seat: numbered.get(b) ?? 0,
                name: a?.full_name?.trim() || "Candidate",
                email: emails.get(b.user_id) ?? "",
                department: a?.department ?? "",
                year: a?.year ?? "",
                hub1: prefs[0] ? (team.get(prefs[0]) ?? "") : "",
                hub2: prefs[1] ? (team.get(prefs[1]) ?? "") : "",
                status: b.status,
                bookedAt: b.created_at,
              };
            })
          : [],
      };
    })
    .filter((s) => !f.session || s.session === f.session);
  return { date: String(day.date), sessions, slots };
}
