"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { friendlyDbError } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * The candidate's side of the results: agreeing to the announcement, and
 * accepting or declining a place. The database functions check that the
 * results are out and that the offer is theirs and still open.
 */

const uuid = z.string().uuid();

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** "I agree": the name may be announced if the candidate is selected or waitlisted. */
export async function agreeToAnnouncement(cycleId: string): Promise<ActionState> {
  if (!uuid.safeParse(cycleId).success) return fail("Recruitment not found.");
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { error } = await supabase.rpc("set_recruitment_consent", { p_cycle: cycleId, p_agree: true });
  if (error) return fail(friendlyDbError(error.message, "Could not save. Please try again."));
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/results");
  return ok("Thank you. Your agreement is saved.");
}

export async function respondToOffer(cycleId: string, accept: boolean): Promise<ActionState> {
  if (!uuid.safeParse(cycleId).success) return fail("Recruitment not found.");
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { error } = await supabase.rpc("respond_to_offer", { p_cycle: cycleId, p_accept: accept });
  if (error) return fail(friendlyDbError(error.message, "Could not save your answer. Please try again."));
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/results");
  deliverEmailsAfterResponse();
  return ok(accept ? "You accepted your place. Welcome!" : "You declined your place.");
}
