"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";
import type { AppRole } from "@/types/database";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { getCurrentCycle } from "@/lib/recruitment/data";

const uuid = z.uuid();

// ── contact messages ────────────────────────────────────────────────────

export async function setMessageState(
  id: string,
  change: "read" | "unread" | "resolved" | "reopened",
): Promise<ActionState> {
  const ctx = await authorize("messages");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("Unknown message.");

  const values =
    change === "read"
      ? { is_reviewed: true }
      : change === "unread"
        ? { is_reviewed: false }
        : change === "resolved"
          ? { is_reviewed: true, is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: ctx.user.id }
          : { is_resolved: false, resolved_at: null, resolved_by: null };

  const { data: before } = await ctx.supabase
    .from("contact_messages")
    .select("id, subject, is_reviewed, is_resolved")
    .eq("id", id)
    .maybeSingle();
  if (!before) return fail("This message no longer exists.");

  const { data: after, error } = await ctx.supabase
    .from("contact_messages")
    .update(values)
    .eq("id", id)
    .select("id, subject, is_reviewed, is_resolved")
    .maybeSingle();
  if (error || !after) return fail("Could not update this message.");

  await logAudit(ctx, { action: `marked_${change}`, table: "contact_messages", id, before, after });
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
  return ok(`Message marked ${change}.`);
}

export async function deleteMessage(id: string): Promise<ActionState> {
  const ctx = await authorize("messages");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("Unknown message.");

  const { data: deleted, error } = await ctx.supabase
    .from("contact_messages")
    .delete()
    .eq("id", id)
    .select("id, name, subject");
  if (error || !deleted?.length) return fail("Could not delete this message.");

  // The sender's email and the message text are deliberately not copied into the log.
  await logAudit(ctx, {
    action: "deleted",
    table: "contact_messages",
    id,
    before: { name: deleted[0].name, subject: deleted[0].subject },
    after: null,
  });
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
  return ok("Message deleted.");
}

// ── broadcast ───────────────────────────────────────────────────────────

const broadcastSchema = z.object({
  // "interview_booked": candidates with a live interview booking in the current recruitment.
  audience: z.enum(["all", "interview_booked", ...ALL_ROLES] as [string, ...string[]]),
  title: z.string().trim().min(3, "Add a title").max(120, "Keep the title under 120 characters"),
  body: z.string().trim().min(3, "Write the message").max(1000, "Keep the message under 1000 characters"),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^\/(?!\/)/.test(v), "Use a path on this site, like /events"),
});

/** Sends an in-app notification to every active member, or to everyone with one role. */
export async function sendBroadcast(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("broadcast");
  if (!ctx) return FORBIDDEN;

  const parsed = broadcastSchema.safeParse({
    audience: formData.get("audience"),
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    link: formData.get("link") ?? "",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { audience, title, body, link } = parsed.data;

  const { data: profiles, error: profilesError } = await ctx.supabase.from("profiles").select("id, is_active");
  if (profilesError || !profiles) return fail("Could not load the recipients.");
  let recipients = profiles.filter((p) => p.is_active !== false).map((p) => p.id as string);

  if (audience === "interview_booked") {
    // Bookings are read under the recruitment rules: only admins with "recruitment" see them all.
    if (!ctx.caps.includes("recruitment")) return fail("Only recruitment admins can message the interview candidates.");
    const cycle = await getCurrentCycle();
    if (!cycle) return fail("There is no recruitment right now.");
    const { data: booked, error } = await ctx.supabase.from("recruitment_slot_bookings").select("user_id").eq("cycle_id", cycle.id).eq("status", "booked");
    if (error || !booked) return fail("Could not load the recipients.");
    const has = new Set(booked.map((b) => b.user_id as string));
    recipients = recipients.filter((id) => has.has(id));
  } else if (audience !== "all") {
    const { data: holders, error } = await ctx.supabase.from("user_roles").select("user_id").eq("role", audience);
    if (error || !holders) return fail("Could not load the recipients.");
    const has = new Set(holders.map((h) => h.user_id as string));
    recipients = recipients.filter((id) => has.has(id));
  }
  if (recipients.length === 0) return fail("Nobody matches that audience.");

  for (let i = 0; i < recipients.length; i += 500) {
    const { error } = await ctx.supabase
      .from("notifications")
      .insert(recipients.slice(i, i + 500).map((user_id) => ({ user_id, title, body, link: link || null })));
    if (error) {
      console.error("broadcast insert failed:", error.message);
      return fail(`Sending stopped after ${i} of ${recipients.length} people. Please check and try again.`);
    }
  }

  const label =
    audience === "all"
      ? "all members"
      : audience === "interview_booked"
        ? "candidates with an interview booking"
        : `everyone with the ${ROLE_LABELS[audience as AppRole]} role`;
  await logAudit(ctx, {
    action: "sent_broadcast",
    table: "notifications",
    after: { audience, title, recipients: recipients.length },
  });
  revalidatePath("/admin/notifications");
  deliverEmailsAfterResponse();
  return ok(`Sent to ${recipients.length} ${recipients.length === 1 ? "person" : "people"} (${label}).`, {
    redirectTo: "/admin/notifications",
  });
}
