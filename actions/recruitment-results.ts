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

/** "Mark as submitted" on a hub's post-result task, with an optional link to the work. */
export async function submitTask(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success) return fail("Task not found.");
  const raw = formData.get("submission_link");
  const link = z
    .string()
    .trim()
    .max(500, "At most 500 characters")
    .refine((v) => v === "" || (/^https:\/\/\S+$/i.test(v) && URL.canParse(v)), "Use a full link that starts with https://")
    .safeParse(typeof raw === "string" ? raw : "");
  if (!link.success) return fail("Please fix the highlighted fields.", { submission_link: link.error.issues[0].message });
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { error } = await supabase.rpc("submit_recruitment_task", { p_team: teamId, p_link: link.data || null });
  if (error) return fail(friendlyDbError(error.message, "Could not save. Please try again."));
  revalidatePath("/recruitment/status");
  return ok("Marked as submitted.");
}
