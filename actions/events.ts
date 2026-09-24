"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function registerForEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("FORBIDDEN");

  const { error } = await supabase
    .from("event_registrations")
    .insert({ event_id: eventId, user_id: user.id });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath("/events");
}

export async function unregisterFromEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("FORBIDDEN");

  const { error } = await supabase
    .from("event_registrations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/events");
}