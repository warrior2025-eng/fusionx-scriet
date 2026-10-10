"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Check-in actions for the scanner page. Every one goes through a database
 * function (migration 0012) that re-checks, inside the database, that the
 * caller is staff or a volunteer for that event. Nothing here is trusted
 * from the page.
 */

export type ScanResult =
  | { result: "ok"; name: string; at: string }
  | { result: "already"; name: string; at: string | null }
  | { result: "cancelled" | "waitlisted"; name: string }
  | { result: "invalid" | "slow_down" | "forbidden" | "error" };

export type RosterEntry = {
  id: string;
  full_name: string;
  department: string | null;
  year: string | null;
  status: "registered" | "attended";
  checked_in_at: string | null;
};

const forbidden = (message: string | undefined) => Boolean(message?.includes("FORBIDDEN"));

export async function checkInByToken(eventId: string, token: string): Promise<ScanResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", { p_event: eventId, p_token: token });
  if (error) return { result: forbidden(error.message) ? "forbidden" : "error" };
  if ((data as ScanResult | null)?.result === "ok") revalidatePath(`/admin/events/${eventId}/registrations`);
  return (data as ScanResult | null) ?? { result: "error" };
}

/** Manual check-in (true) or undo (false, staff only). Returns an error message, or null. */
export async function setAttendance(eventId: string, registrationId: string, attended: boolean): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance", { p_registration: registrationId, p_attended: attended });
  if (error) {
    if (forbidden(error.message)) return attended ? "You can't check people in for this event." : "Only staff can undo a check-in.";
    if (error.message.includes("certificate has already been issued")) {
      return "A certificate has already been issued for this attendee, so the check-in can't be undone.";
    }
    if (error.message.includes("Only a registered attendee")) return "Only a registered attendee can be checked in.";
    return "That didn't work. Please try again.";
  }
  revalidatePath(`/admin/events/${eventId}/registrations`);
  return null;
}

/** Everyone registered or checked in: names only, for the search and the counter. */
export async function loadRoster(eventId: string): Promise<RosterEntry[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_roster", { p_event: eventId });
  if (error) return null;
  return (data ?? []) as RosterEntry[];
}
