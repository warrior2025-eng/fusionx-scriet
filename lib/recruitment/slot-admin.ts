import type { createClient } from "@/lib/supabase/server";
import { toSessions, type Session, type SlotMode } from "./slots";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Interview slots as the admin panel sees them: days, every slot with who is
 * in it, and the counts. Read with the admin's own session, so row level
 * security decides what comes back.
 */

export type SlotDayRow = {
  id: string;
  cycle_id: string;
  date: string;
  sessions: Session[];
  slot_minutes: number;
  capacity: number;
  mode: SlotMode;
  venue: string | null;
  is_active: boolean;
};

export type BookingRow = {
  id: string;
  slot_id: string;
  user_id: string;
  application_id: string;
  status: "booked" | "attended" | "no_show";
  full_name: string;
  department: string | null;
  year: string | null;
  preferences: string[];
};

export type BoardSlot = {
  id: string;
  day_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  is_blocked: boolean;
  bookings: BookingRow[];
};

export type MeetLinkRow = { id: string; day_id: string; slot_id: string | null; meet_url: string; published_at: string | null };

export async function loadSlotDays(supabase: Supabase, cycleId: string): Promise<SlotDayRow[]> {
  const { data } = await supabase.from("recruitment_slot_days").select("*").eq("cycle_id", cycleId).order("date");
  return (data ?? []).map((d) => ({ ...(d as SlotDayRow), sessions: toSessions(d.sessions) }));
}

/** Every slot of the cycle (all days), with its live bookings and the candidates' names. */
export async function loadBoard(supabase: Supabase, cycleId: string): Promise<BoardSlot[]> {
  const [{ data: slotRows }, { data: bookingRows }] = await Promise.all([
    supabase.from("recruitment_slots").select("id, day_id, starts_at, ends_at, capacity, is_blocked").eq("cycle_id", cycleId).order("starts_at"),
    supabase
      .from("recruitment_slot_bookings")
      .select("id, slot_id, user_id, application_id, status, recruitment_applications(full_name, department, year, preferences)")
      .eq("cycle_id", cycleId)
      .neq("status", "cancelled"),
  ]);
  type Joined = {
    id: string;
    slot_id: string;
    user_id: string;
    application_id: string;
    status: BookingRow["status"];
    recruitment_applications: { full_name: string | null; department: string | null; year: string | null; preferences: string[] | null } | null;
  };
  const bookings: BookingRow[] = ((bookingRows ?? []) as unknown as Joined[]).map((b) => ({
    id: b.id,
    slot_id: b.slot_id,
    user_id: b.user_id,
    application_id: b.application_id,
    status: b.status,
    full_name: b.recruitment_applications?.full_name?.trim() || "Candidate",
    department: b.recruitment_applications?.department ?? null,
    year: b.recruitment_applications?.year ?? null,
    preferences: b.recruitment_applications?.preferences ?? [],
  }));
  return ((slotRows ?? []) as Omit<BoardSlot, "bookings">[]).map((slot) => ({
    ...slot,
    bookings: bookings.filter((b) => b.slot_id === slot.id).sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));
}

export async function loadMeetLinks(supabase: Supabase, dayIds: string[]): Promise<MeetLinkRow[]> {
  if (dayIds.length === 0) return [];
  const { data } = await supabase.from("recruitment_meet_links").select("id, day_id, slot_id, meet_url, published_at").in("day_id", dayIds);
  return (data ?? []) as MeetLinkRow[];
}

/** People in the cycle with no slot yet: submitted, and still drafting. */
export async function countUnbooked(supabase: Supabase, cycleId: string): Promise<{ submitted: number; drafts: number }> {
  const [{ data: apps }, { data: held }] = await Promise.all([
    supabase.from("recruitment_applications").select("user_id, status").eq("cycle_id", cycleId).in("status", ["draft", "submitted"]),
    supabase.from("recruitment_slot_bookings").select("user_id").eq("cycle_id", cycleId).neq("status", "cancelled"),
  ]);
  const booked = new Set((held ?? []).map((b) => b.user_id as string));
  const without = (apps ?? []).filter((a) => !booked.has(a.user_id as string));
  return { submitted: without.filter((a) => a.status === "submitted").length, drafts: without.filter((a) => a.status === "draft").length };
}
