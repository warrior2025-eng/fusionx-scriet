"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EventActionResult = { error?: string };

// The messages the database raises when a registration is refused (see
// guard_event_registration in migration 0008). They are safe to show as is.
const REFUSALS = ["Registration for this event is closed", "This event is full", "Event not found"];

export async function registerForEvent(eventId: string): Promise<EventActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to register." };

  const { error } = await supabase
    .from("event_registrations")
    .insert({ event_id: eventId, user_id: user.id });

  // Unique constraint on (event_id, user_id): a duplicate click is a
  // harmless no-op.
  if (error && error.code !== "23505") {
    const refusal = REFUSALS.find((message) => error.message.includes(message));
    return { error: refusal ? `${refusal}.` : "Could not register. Please try again." };
  }

  revalidatePath("/events");
  return {};
}

export async function unregisterFromEvent(eventId: string): Promise<EventActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { error } = await supabase
    .from("event_registrations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  if (error) return { error: "Could not cancel your registration. Please try again." };

  revalidatePath("/events");
  return {};
}
