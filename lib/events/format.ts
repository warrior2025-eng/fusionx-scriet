/**
 * Dates and labels for events. Everything is shown in Indian Standard Time:
 * `event_date` / `event_time` are stored as the local (IST) date and time,
 * and timestamps (deadline, end, check-in) are converted to IST for display.
 */

export const IST = "Asia/Kolkata";

export type RegistrationStatus = "registered" | "waitlisted" | "cancelled" | "attended";

/** "12 October 2026" from a date column ("2026-10-12"). */
export function eventDate(date: string, month: "long" | "short" = "long"): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "5:30 pm" from a time column ("17:30:00"). */
export function eventTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "12 October 2026, 5:30 pm IST" (time and zone only when a time is set). */
export function eventWhen(date: string, time?: string | null): string {
  return time ? `${eventDate(date)}, ${eventTime(time)} IST` : eventDate(date);
}

/** A timestamp in IST: "12 Oct 2026, 5:30 pm IST". */
export function istDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const text = new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  });
  return `${text} IST`;
}

/** Just the IST clock time of a timestamp: "10:42 am". */
export function istTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
}

/** A timestamp as the value of a datetime-local input, in IST ("2026-10-12T17:30"). */
export function toIstInput(value: string | null | undefined): string {
  if (!value) return "";
  const shifted = new Date(new Date(value).getTime() + 5.5 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}

/** A datetime-local value typed as IST, as an ISO timestamp with its offset. */
export function fromIstInput(value: string): string {
  return `${value.length === 16 ? `${value}:00` : value}+05:30`;
}

/** Today's date in India, as "2026-10-12". */
export function todayInIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

export const STATUS_LABELS: Record<RegistrationStatus, string> = {
  registered: "Registered",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  attended: "Attended",
};

type SeatInfo = { capacity: number | null; registered: number; waitlisted: number };
type EventForSeats = {
  status: string;
  registration_open: boolean;
  registration_deadline: string | null;
  registration_url: string | null;
  waitlist_enabled: boolean;
};

export type RegistrationAvailability = "open" | "waitlist" | "full" | "closed" | "external";

/** Whether a new person could register right now, and how. The database decides for real. */
export function availability(event: EventForSeats, seats: SeatInfo | null): RegistrationAvailability {
  if (event.registration_url) return "external";
  const live = event.status === "upcoming" || event.status === "live";
  const pastDeadline = event.registration_deadline ? Date.now() > new Date(event.registration_deadline).getTime() : false;
  if (!live || !event.registration_open || pastDeadline) return "closed";
  if (!seats || seats.capacity === null || seats.registered < seats.capacity) return "open";
  return event.waitlist_enabled ? "waitlist" : "full";
}

/** "12 of 60 seats left", "Waitlist open", "Event full" … or null when there is no limit. */
export function seatsLine(event: EventForSeats, seats: SeatInfo | null): string | null {
  if (!seats || seats.capacity === null) return null;
  const left = Math.max(seats.capacity - seats.registered, 0);
  if (left > 0) return `${left} of ${seats.capacity} seats left`;
  return event.waitlist_enabled ? "All seats taken. Waitlist open" : "Event full";
}
