"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { fromIstInput } from "@/lib/events/format";
import { STAGES, friendlyDbError } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * What a team's reviewers (and admins) do to an application: score it, keep
 * private notes, and move it between stages. Who may do which is decided in
 * the database: a reviewer only ever reaches their own team's applications.
 */

const uuid = z.string().uuid();

const reviewSchema = z.object({
  score: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]),
  private_notes: z.string().trim().max(2000),
});

export async function saveReview(applicationId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return fail("Application not found.");
  const parsed = reviewSchema.safeParse({ score: formData.get("score") ?? "", private_notes: formData.get("private_notes") ?? "" });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Please sign in.");

  const { error } = await supabase.from("recruitment_reviews").upsert(
    {
      application_id: applicationId,
      team_id: teamId,
      reviewer_id: user.id,
      score: parsed.data.score === "" ? null : parsed.data.score,
      private_notes: parsed.data.private_notes || null,
    },
    { onConflict: "application_id,team_id,reviewer_id" },
  );
  if (error) return fail(friendlyDbError(error.message, "You can't review this application."));
  revalidatePath("/review");
  return ok("Review saved.");
}

const stageSchema = z.object({
  stage: z.enum(STAGES as [string, ...string[]]),
  interview_at: z.string().trim().max(40),
  interview_location: z.string().trim().max(300),
  final_note: z.string().trim().max(1000),
});

export async function setApplicationStage(applicationId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return fail("Application not found.");
  const parsed = stageSchema.safeParse({
    stage: formData.get("stage"),
    interview_at: formData.get("interview_at") ?? "",
    interview_location: formData.get("interview_location") ?? "",
    final_note: formData.get("final_note") ?? "",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { stage, interview_at, interview_location, final_note } = parsed.data;
  if (stage === "interview" && !interview_at) return fail("Please fix the highlighted fields.", { interview_at: "Add the interview date and time" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_recruitment_stage", {
    p_application: applicationId,
    p_team: teamId,
    p_stage: stage,
    p_interview_at: interview_at ? fromIstInput(interview_at) : null,
    p_interview_location: interview_location || null,
    p_final_note: final_note || null,
  });
  if (error) return fail(friendlyDbError(error.message, "Could not update the stage."));
  revalidatePath("/review");
  revalidatePath("/recruitment/status");
  deliverEmailsAfterResponse();
  return ok("Stage updated.");
}
