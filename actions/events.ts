"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationStatus } from "@/lib/events/format";

export type EventActionResult = {
  error?: string;
  status?: RegistrationStatus;
  /** Place in the waitlist, when waitlisted. */
  position?: number | null;
};

// What register_for_event / cancel_registration (migration 0012) raise when
// they refuse. These are written for people and safe to show as they are.
const REFUSALS = [
  "Please sign in to register",
  "This account is deactivated",
  "Event not found",
  "Registration for this event is handled on another site",
  "Registration for this event is closed",
  "This event is full",
  "You have already attended this event",
];

function refusal(message: string | undefined, fallback: string): string {
  const known = REFUSALS.find((text) => message?.includes(text));
  return known ? `${known}.` : fallback;
}

function revalidate(eventId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/profile/events");
  revalidatePath("/");
}

/**
 * Registers the signed-in user. The database function does everything in one
 * step under a lock on the event: it checks the event is open, counts the
 * seats, and registers or waitlists. Two people can never take the last seat.
 */
export async function registerForEvent(eventId: string): Promise<EventActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_for_event", { p_event: eventId });
  if (error) return { error: refusal(error.message, "Could not register. Please try again.") };

  revalidate(eventId);
  const result = (data ?? {}) as { status?: RegistrationStatus; position?: number | null };
  return { status: result.status, position: result.position ?? null };
}

/** Cancels the user's own registration; a freed seat goes to the waitlist. */
export async function cancelRegistration(eventId: string): Promise<EventActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_registration", { p_event: eventId });
  if (error) return { error: refusal(error.message, "Could not cancel your registration. Please try again.") };

  revalidate(eventId);
  return { status: "cancelled" };
}
