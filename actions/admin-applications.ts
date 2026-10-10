"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN, type AdminContext } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import type { ApplicationStatus } from "@/types/database";

const STATUSES = ["submitted", "under_review", "shortlisted", "selected", "rejected", "archived"] as const;

const STATUS_MESSAGES: Record<ApplicationStatus, string> = {
  submitted: "Your application was received.",
  under_review: "Your application is now under review.",
  shortlisted: "You've been shortlisted! We'll be in touch about next steps.",
  selected: "Congratulations, you've been selected to join FusionX!",
  rejected: "Your application wasn't selected this time.",
  archived: "Your application has been archived.",
};

const reviewSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters"),
});

/** Applies a status (and optional note) to a set of applications, one audit entry each. */
async function review(ctx: AdminContext, ids: string[], status: ApplicationStatus, note: string): Promise<number> {
  const { data: before } = await ctx.supabase.from("applications").select("id, status, review_notes, user_id").in("id", ids);
  const rows = before ?? [];
  if (rows.length === 0) return 0;

  const { data: updated, error } = await ctx.supabase
    .from("applications")
    .update({
      status,
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
      ...(note ? { review_notes: note } : {}),
    })
    .in("id", rows.map((r) => r.id))
    .select("id");
  if (error || !updated) return 0;

  const done = new Set(updated.map((u) => u.id));
  for (const row of rows) {
    if (!done.has(row.id)) continue;
    await logAudit(ctx, {
      action: "reviewed_application",
      table: "applications",
      id: row.id,
      before: { status: row.status, review_notes: row.review_notes },
      after: { status, review_notes: note || row.review_notes },
    });
  }

  // Tell applicants whose status actually changed.
  const notices = rows
    .filter((r) => done.has(r.id) && r.user_id && r.status !== status)
    .map((r) => ({ user_id: r.user_id, title: "Application update", body: STATUS_MESSAGES[status], link: "/join" }));
  if (notices.length) await ctx.supabase.from("notifications").insert(notices);

  revalidatePath("/admin/applications");
  revalidatePath("/admin");
  return done.size;
}

export async function reviewApplication(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("applications");
  if (!ctx) return FORBIDDEN;
  if (!z.uuid().safeParse(id).success) return fail("Unknown application.");

  const parsed = reviewSchema.safeParse({ status: formData.get("status"), note: formData.get("note") ?? "" });
  if (!parsed.success) return fail("Please fix the highlighted fields.", { note: parsed.error.issues[0]?.message ?? "" });

  const count = await review(ctx, [id], parsed.data.status, parsed.data.note);
  if (count === 0) return fail("Could not update this application.");
  revalidatePath(`/admin/applications/${id}`);
  return ok("Application updated.");
}

export async function bulkReviewApplications(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("applications");
  if (!ctx) return FORBIDDEN;

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string" && z.uuid().safeParse(v).success);
  if (ids.length === 0) return fail("Select at least one application.");
  if (ids.length > 200) return fail("Select at most 200 applications at a time.");

  const parsed = reviewSchema.safeParse({ status: formData.get("status"), note: formData.get("note") ?? "" });
  if (!parsed.success) return fail("Choose what to do with the selected applications.", { note: parsed.error.issues[0]?.message ?? "" });

  const count = await review(ctx, ids, parsed.data.status, parsed.data.note);
  if (count === 0) return fail("Could not update the selected applications.");
  return ok(`${count} application${count === 1 ? "" : "s"} marked ${parsed.data.status.replace(/_/g, " ")}.`);
}
