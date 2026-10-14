"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { friendlyDbError } from "@/lib/recruitment/data";
import type { SlotAvailability } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

/**
 * A candidate choosing an interview slot. The database decides everything
 * that matters (seats, cutoff, one slot per person); these only pass the
 * request on and turn its answer into words.
 */

const uuid = z.string().uuid();

/** The slots of a cycle with their seat counts, for the picker (refreshed while it is open). */
export async function loadSlots(cycleId: string): Promise<SlotAvailability[]> {
  if (!uuid.safeParse(cycleId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("recruitment_slot_availability", { p_cycle: cycleId });
  return (data ?? []) as SlotAvailability[];
}

export type BookResult = { ok: true; remaining: number; moved: boolean } | { ok: false; full: boolean; message: string };

export async function bookSlot(slotId: string): Promise<BookResult> {
  if (!uuid.safeParse(slotId).success) return { ok: false, full: false, message: "Slot not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, full: false, message: "Please sign in to choose a slot." };

  const { data, error } = await supabase.rpc("book_slot", { p_slot: slotId });
  if (error) {
    if (error.message === "Slot full") return { ok: false, full: true, message: "This slot just filled up. Please pick another." };
    return { ok: false, full: false, message: friendlyDbError(error.message, "Could not book this slot. Please try again.") };
  }
  revalidatePath("/recruitment/status");
  deliverEmailsAfterResponse();
  const result = data as { remaining: number; moved: boolean };
  return { ok: true, remaining: result.remaining, moved: result.moved };
}

export async function cancelMySlot(cycleId: string): Promise<ActionState> {
  if (!uuid.safeParse(cycleId).success) return fail("Recruitment not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_slot_booking", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not cancel your slot."));
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/slot");
  deliverEmailsAfterResponse();
  return ok("Your slot was cancelled.", { redirectTo: "/recruitment/status" });
}
