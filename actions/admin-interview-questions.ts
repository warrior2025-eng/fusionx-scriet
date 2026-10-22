"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { friendlyDbError } from "@/lib/recruitment/data";

/**
 * The interview question bank, per hub ("recruitment.content": admins and
 * editors). Candidates never read it; the panel reveals questions to a slot
 * one at a time (actions/interview-panel.ts).
 */

const uuid = z.string().uuid();
const schema = z.object({
  team_id: z.string().uuid("Choose a hub"),
  body: z.string().trim().min(3, "Write the question").max(1000, "Keep this under 1000 characters"),
  display_order: z.coerce.number({ message: "Enter a number" }).int().min(0).max(999),
});

function touched(cycleId: string) {
  revalidatePath(`/admin/recruitment/${cycleId}/interview-questions`);
  revalidatePath("/admin/interviews", "layout");
}

export async function saveInterviewQuestion(cycleId: string, questionId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success || (questionId && !uuid.safeParse(questionId).success)) return fail("Not found.");
  const parsed = schema.safeParse({
    team_id: formData.get("team_id") ?? "",
    body: formData.get("body") ?? "",
    display_order: formData.get("display_order") || "0",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { data: team } = await ctx.supabase.from("recruitment_teams").select("id").eq("id", parsed.data.team_id).eq("cycle_id", cycleId).maybeSingle();
  if (!team) return fail("Please fix the highlighted fields.", { team_id: "Choose a hub of this recruitment" });

  if (questionId) {
    const { data: before } = await ctx.supabase.from("recruitment_interview_questions").select("team_id, body, display_order").eq("id", questionId).maybeSingle();
    if (!before) return fail("Question not found.");
    const { error } = await ctx.supabase.from("recruitment_interview_questions").update(parsed.data).eq("id", questionId);
    if (error) return fail(friendlyDbError(error.message, "Could not save the question."));
    await logAudit(ctx, { action: "updated", table: "recruitment_interview_questions", id: questionId, before, after: parsed.data });
    touched(cycleId);
    return ok("Saved.");
  }
  const { data, error } = await ctx.supabase.from("recruitment_interview_questions").insert({ ...parsed.data, created_by: ctx.user.id }).select("id").single();
  if (error || !data) return fail(friendlyDbError(error?.message, "Could not add the question. Has migration 0023 been run?"));
  await logAudit(ctx, { action: "created", table: "recruitment_interview_questions", id: data.id as string, after: parsed.data });
  touched(cycleId);
  return ok("Question added.");
}

export async function deleteInterviewQuestion(cycleId: string, questionId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(questionId).success) return fail("Not found.");
  const { data: before } = await ctx.supabase.from("recruitment_interview_questions").select("team_id, body").eq("id", questionId).maybeSingle();
  const { error } = await ctx.supabase.from("recruitment_interview_questions").delete().eq("id", questionId);
  if (error) return fail(friendlyDbError(error.message, "Could not delete the question."));
  await logAudit(ctx, { action: "deleted", table: "recruitment_interview_questions", id: questionId, before });
  touched(cycleId);
  return ok("Question deleted.");
}
