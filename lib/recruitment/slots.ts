/**
 * Interview slots: shapes and formatting the pages share. Every time is shown
 * in India Standard Time, whatever the viewer's own time zone, and written the
 * way the site writes times: "10:00 AM to 10:10 AM". No database access here,
 * so client components may import it.
 */

export type SlotState = "available" | "full" | "blocked" | "closed";
export type SlotMode = "online_meet" | "offline";

/** One row of recruitment_slot_availability: times and counts, never who booked. */
export type SlotAvailability = {
  slot_id: string;
  day_id: string;
  day: string;
  starts_at: string;
  ends_at: string;
  session_label: string | null;
  capacity: number;
  booked: number;
  remaining: number;
  state: SlotState;
  mode: SlotMode;
  venue: string | null;
  mine: boolean;
};

export type Session = { label: string; start: string; end: string };

export type MyBooking = {
  booking_id: string;
  status: "booked" | "attended" | "no_show";
  slot_id: string;
  starts_at: string;
  ends_at: string;
  day: string;
  mode: SlotMode;
  venue: string | null;
  cutoff_at: string;
  can_change: boolean;
};

export type MeetLinkState =
  | { state: "none" | "offline"; day?: string }
  | { state: "before_day" | "not_published" | "ended"; day: string; starts_at: string; ends_at: string }
  | { state: "available"; url: string; day: string; starts_at: string; ends_at: string };

export const IST = "Asia/Kolkata";
export const DEFAULT_SESSIONS: Session[] = [
  { label: "Morning", start: "10:00", end: "13:00" },
  { label: "Afternoon", start: "15:00", end: "18:00" },
];
export const DEFAULT_INSTRUCTIONS =
  "Your interview will be held online on Google Meet. The meeting link will be shared on the day of your interview. Please join on time with a stable internet connection, your camera on, and a working microphone.";
/** What a calendar entry says instead of the link. */
export const CALENDAR_LOCATION = "Online (Google Meet). Link will be shared on the interview day";
export const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export const MODE_LABELS: Record<SlotMode, string> = { online_meet: "Online (Google Meet)", offline: "In person" };
export const STATE_LABELS: Record<SlotState, string> = { available: "Available", full: "Full", blocked: "Unavailable", closed: "Closed" };

// Recent browsers put a narrow no-break space before AM/PM; the site uses a plain one.
const clean = (text: string) => text.replace(/[  ]/g, " ");

/** "10:00 AM" in IST. */
export function slotTime(iso: string): string {
  return clean(new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }));
}

/** "10:00 AM to 10:10 AM" in IST. */
export function slotRange(startsAt: string, endsAt: string): string {
  return `${slotTime(startsAt)} to ${slotTime(endsAt)}`;
}

/** "Mon, 20 Oct 2026" for a date column ("2026-10-20"). */
export function dayLabel(day: string, weekday: "short" | "long" = "short"): string {
  return clean(
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday, day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  );
}

/** "1:00 PM" from an IST clock time ("13:00"). */
export function clockLabel(clock: string): string {
  const [h, m] = clock.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** Today's date in India, as "2026-10-20". */
export function todayIst(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST });
}

const minutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

/** How many slots a day's sessions make. */
export function slotCount(sessions: Session[], slotMinutes: number): number {
  return sessions.reduce((total, s) => total + Math.max(0, Math.floor((minutes(s.end) - minutes(s.start)) / slotMinutes)), 0);
}

/** Reads a day's sessions from the database value, keeping only well-formed ones. */
export function toSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Session => Boolean(s) && typeof s.start === "string" && typeof s.end === "string")
    .map((s) => ({ label: typeof s.label === "string" ? s.label : "", start: s.start, end: s.end }));
}

export type SlotGroup = { label: string; range: string; slots: SlotAvailability[] };
export type SlotDay = { day: string; dayId: string; mode: SlotMode; venue: string | null; groups: SlotGroup[]; breaks: (string | null)[] };

/**
 * Slots by day, then by session. `breaks[i]` is the gap after group i, as
 * "Lunch break 1:00 PM to 3:00 PM" (a gap that covers 1 PM) or "Break …".
 */
export function groupSlots(slots: SlotAvailability[]): SlotDay[] {
  const days: SlotDay[] = [];
  for (const slot of slots) {
    let day = days.find((d) => d.dayId === slot.day_id);
    if (!day) {
      day = { day: slot.day, dayId: slot.day_id, mode: slot.mode, venue: slot.venue, groups: [], breaks: [] };
      days.push(day);
    }
    const label = slot.session_label || "Slots";
    let group = day.groups.at(-1);
    if (!group || group.label !== label) {
      group = { label, range: "", slots: [] };
      day.groups.push(group);
    }
    group.slots.push(slot);
  }
  for (const day of days) {
    for (const group of day.groups) group.range = slotRange(group.slots[0].starts_at, group.slots.at(-1)!.ends_at);
    day.breaks = day.groups.map((group, i) => {
      const next = day.groups[i + 1];
      if (!next) return null;
      const from = group.slots.at(-1)!.ends_at;
      const to = next.slots[0].starts_at;
      if (new Date(to).getTime() <= new Date(from).getTime()) return null;
      const startClock = new Date(from).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
      const endClock = new Date(to).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
      const lunch = startClock <= "13:00" && endClock >= "14:00";
      return `${lunch ? "Lunch break" : "Break"} ${slotRange(from, to)}`;
    });
  }
  return days;
}

/** What a slot button says under its time, and its accessible name. */
export function seatsText(slot: SlotAvailability): string {
  if (slot.mine) return "Your slot";
  if (slot.state === "full") return "Full";
  if (slot.state === "blocked") return "Unavailable";
  if (slot.state === "closed") return "Closed";
  return `${slot.remaining} of ${slot.capacity} left`;
}

export function slotAriaLabel(slot: SlotAvailability): string {
  const time = slotRange(slot.starts_at, slot.ends_at);
  if (slot.mine) return `${time}, your slot`;
  if (slot.state === "available") return `${time}, ${slot.remaining} ${slot.remaining === 1 ? "seat" : "seats"} left`;
  return `${time}, ${STATE_LABELS[slot.state].toLowerCase()}`;
}
