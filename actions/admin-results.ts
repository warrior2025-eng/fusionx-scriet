"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { fromIstInput } from "@/lib/events/format";
import { friendlyDbError } from "@/lib/recruitment/data";

/**
 * Results day, from the admin panel ("recruitment" capability: admins).
 * Decisions, the lock, the schedule and the waitlist all go through database
 * functions, which check the rules again and write the audit log themselves;
 * the settings saved straight to a table are logged here.
 */

const uuid = z.string().uuid();
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const DECISIONS = ["undecided", "selected", "waitlisted", "not_selected"] as const;

function touched(cycleId: string) {
  deliverEmailsAfterResponse();
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/results");
  revalidatePath("/", "layout");
}

async function admin(cycleId: string) {
  const ctx = await authorize("recruitment");
  if (!ctx || !uuid.safeParse(cycleId).success) return null;
  return ctx;
}

// ── decisions ──────────────────────────────────────────────────────────
const rowSchema = z.object({
  decision: z.enum(DECISIONS),
  original: z.enum(DECISIONS),
  message: z.string().max(1000, "At most 1000 characters"),
  originalMessage: z.string().max(1000),
  reason: z.string().max(300),
});

/**
 * Saves the board for one hub: every row whose decision or message changed,
 * and the ticked rows set to the bulk decision.
 */
export async function saveDecisions(cycleId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const ticked = new Set(formData.getAll("ids").filter((v): v is string => typeof v === "string"));
  const bulk = text(formData, "bulk_decision");
  if (bulk && !(DECISIONS as readonly string[]).includes(bulk)) return fail("Choose a decision for the ticked rows.");
  if (bulk && ticked.size === 0) return fail("Tick the rows to set, or clear the bulk decision.");

  const rows = formData.getAll("row").filter((v): v is string => typeof v === "string" && uuid.safeParse(v).success);
  let saved = 0;
  const errors: string[] = [];
  for (const id of rows.slice(0, 400)) {
    const parsed = rowSchema.safeParse({
      decision: bulk && ticked.has(id) ? bulk : text(formData, `dec_${id}`),
      original: text(formData, `orig_${id}`) || "undecided",
      message: text(formData, `msg_${id}`),
      originalMessage: text(formData, `origmsg_${id}`),
      reason: text(formData, `why_${id}`),
    });
    if (!parsed.success) {
      errors.push(parsed.error.issues[0]?.message ?? "Invalid row");
      continue;
    }
    const v = parsed.data;
    if (v.decision === v.original && v.message === v.originalMessage) continue;
    const { error } = await ctx.supabase.rpc("set_final_decision", {
      p_application: id,
      p_team: teamId,
      p_decision: v.decision,
      p_note: v.message,
      p_reason: v.reason || null,
    });
    if (error) errors.push(friendlyDbError(error.message, "Could not save one decision."));
    else saved++;
  }
  touched(cycleId);
  if (errors.length && saved === 0) return fail(`Nothing saved. ${[...new Set(errors)].slice(0, 2).join(" ")}`);
  if (errors.length) return ok(`${saved} saved. ${errors.length} not saved: ${[...new Set(errors)].slice(0, 2).join(" ")}`);
  return ok(saved ? `${saved} decision${saved === 1 ? "" : "s"} saved.` : "No changes to save.");
}

/** Every still-undecided candidate (of this hub, or of all hubs) gets one decision. */
export async function markRest(cycleId: string, teamId: string | null, decision: "not_selected" | "waitlisted"): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || (teamId && !uuid.safeParse(teamId).success)) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("bulk_mark_undecided", { p_cycle: cycleId, p_team: teamId, p_decision: decision });
  if (error) return fail(friendlyDbError(error.message, "Could not mark them."));
  touched(cycleId);
  return ok(`${data ?? 0} marked ${decision === "waitlisted" ? "waitlisted" : "not selected"}.`);
}

export async function moveWaitlist(cycleId: string, applicationId: string, teamId: string, by: -1 | 1): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("move_waitlist", { p_application: applicationId, p_team: teamId, p_by: by });
  if (error) return fail(friendlyDbError(error.message, "Could not move."));
  touched(cycleId);
  return ok("Waitlist order updated.");
}

// ── lock ───────────────────────────────────────────────────────────────
export async function lockDecisions(cycleId: string): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("lock_decisions", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not lock decisions."));
  touched(cycleId);
  return ok("Decisions are locked. Reviewers can no longer change them.");
}

export async function unlockDecisions(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const reason = z.string().trim().min(3, "Say why (at least 3 characters)").max(500).safeParse(text(formData, "reason"));
  if (!reason.success) return fail("Please fix the highlighted fields.", { reason: reason.error.issues[0].message });
  const { error } = await ctx.supabase.rpc("unlock_decisions", { p_cycle: cycleId, p_reason: reason.data });
  if (error) return fail(friendlyDbError(error.message, "Could not unlock."));
  touched(cycleId);
  return ok("Decisions unlocked. The reason is in the audit log.");
}

// ── date and schedule ──────────────────────────────────────────────────
const when = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time")
  .transform((v) => fromIstInput(v));

/** The planned date shown to candidates before anything is scheduled. */
export async function saveResultsDate(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const at = when.safeParse(text(formData, "results_at"));
  if (!at.success) return fail("Please fix the highlighted fields.", { results_at: at.error.issues[0].message });
  const { data: before } = await ctx.supabase.from("recruitment_cycles").select("results_publish_at").eq("id", cycleId).maybeSingle();
  const { error } = await ctx.supabase.rpc("set_results_date", { p_cycle: cycleId, p_at: at.data });
  if (error) return fail(friendlyDbError(error.message, "Could not save the date."));
  await logAudit(ctx, { action: "set_results_date", table: "recruitment_cycles", id: cycleId, before, after: { results_publish_at: at.data } });
  touched(cycleId);
  return ok("Results date saved. Candidates see it on their status page.");
}

/** Schedule, or reschedule, the automatic publish. */
export async function scheduleResults(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const at = when.safeParse(text(formData, "results_at"));
  if (!at.success) return fail("Please fix the highlighted fields.", { results_at: at.error.issues[0].message });
  const { error } = await ctx.supabase.rpc("schedule_results", { p_cycle: cycleId, p_at: at.data });
  if (error) return fail(friendlyDbError(error.message, "Could not schedule the results."));
  touched(cycleId);
  return ok("Results scheduled. They will appear on their own at that time.");
}

export async function cancelSchedule(cycleId: string): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("cancel_results_schedule", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not cancel the schedule."));
  touched(cycleId);
  return ok("Schedule cancelled. Nothing will be published until you schedule again.");
}

export async function publishNow(cycleId: string): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("publish_results_now", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not publish the results."));
  touched(cycleId);
  const notified = (data as { notified?: number } | null)?.notified ?? 0;
  return ok(`Results published. ${notified} candidate${notified === 1 ? "" : "s"} notified.`, { viewHref: "/recruitment/results" });
}

// ── settings ───────────────────────────────────────────────────────────
const settingsSchema = z.object({
  one_hub_mode: z.enum(["not_selected", "keep_waitlisted"]),
  show_selected_publicly: z.boolean(),
  show_waitlist_publicly: z.boolean(),
  results_banner_on: z.boolean(),
  results_banner_text: z.string().min(1, "Write the banner text").max(200, "At most 200 characters"),
});

export async function saveResultSettings(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const parsed = settingsSchema.safeParse({
    one_hub_mode: text(formData, "one_hub_mode"),
    show_selected_publicly: formData.get("show_selected_publicly") === "on",
    show_waitlist_publicly: formData.get("show_waitlist_publicly") === "on",
    results_banner_on: formData.get("results_banner_on") === "on",
    results_banner_text: text(formData, "results_banner_text"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { data: before } = await ctx.supabase
    .from("recruitment_cycles")
    .select("one_hub_mode, show_selected_publicly, show_waitlist_publicly, results_banner_on, results_banner_text")
    .eq("id", cycleId)
    .maybeSingle();
  if (!before) return fail("Cycle not found.");
  const { error } = await ctx.supabase.from("recruitment_cycles").update(parsed.data).eq("id", cycleId);
  if (error) return fail(friendlyDbError(error.message, "Could not save the settings."));
  await logAudit(ctx, { action: "updated_result_settings", table: "recruitment_cycles", id: cycleId, before, after: parsed.data });
  touched(cycleId);
  return ok("Saved.", { viewHref: "/recruitment/results" });
}

const inductionSchema = z.object({
  induction_at: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time")]),
  induction_mode: z.enum(["", "online", "in_person"]),
  induction_link: z.union([z.literal(""), z.string().max(300).regex(/^https:\/\/\S{6,}$/i, "Use a full https:// link")]),
  induction_venue: z.string().max(300),
  induction_note: z.string().max(1000),
  offer_days: z.coerce.number({ message: "Enter a number" }).int().min(1, "At least 1 day").max(30, "At most 30 days"),
  auto_expire: z.boolean(),
});

/** Induction details (shown to selected candidates only) and the offer rules. The link itself is not logged. */
export async function saveInduction(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const parsed = inductionSchema.safeParse({
    induction_at: text(formData, "induction_at"),
    induction_mode: text(formData, "induction_mode"),
    induction_link: text(formData, "induction_link"),
    induction_venue: text(formData, "induction_venue"),
    induction_note: text(formData, "induction_note"),
    offer_days: text(formData, "offer_days") || "3",
    auto_expire: formData.get("auto_expire") === "on",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  const values = {
    cycle_id: cycleId,
    induction_at: v.induction_at ? fromIstInput(v.induction_at) : null,
    induction_mode: v.induction_mode || null,
    induction_link: v.induction_link || null,
    induction_venue: v.induction_venue || null,
    induction_note: v.induction_note || null,
    offer_days: v.offer_days,
    auto_expire: v.auto_expire,
    updated_by: ctx.user.id,
  };
  const { error } = await ctx.supabase.from("recruitment_results_config").upsert(values, { onConflict: "cycle_id" });
  if (error) return fail(friendlyDbError(error.message, "Could not save."));
  await logAudit(ctx, {
    action: "updated_induction",
    table: "recruitment_results_config",
    id: cycleId,
    note: `Induction ${values.induction_at ? "dated" : "not dated"}, ${values.induction_link ? "link set" : "no link"}; ${v.offer_days} day(s) to answer; auto-expiry ${v.auto_expire ? "on" : "off"}`,
  });
  touched(cycleId);
  return ok("Saved. Selected candidates see the induction details on their status page.");
}

// ── after the results ──────────────────────────────────────────────────
export async function promote(cycleId: string, applicationId: string, teamId: string): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("promote_waitlisted", { p_application: applicationId, p_team: teamId });
  if (error) return fail(friendlyDbError(error.message, "Could not promote."));
  touched(cycleId);
  return ok("Promoted. They have been notified, and the public lists are updated.", { viewHref: "/recruitment/results" });
}

export async function removeFromWaitlist(cycleId: string, applicationId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const reason = z.string().trim().min(3, "Say why").max(300).safeParse(text(formData, "reason"));
  if (!reason.success) return fail("Please fix the highlighted fields.", { reason: reason.error.issues[0].message });
  const { error } = await ctx.supabase.rpc("remove_from_waitlist", { p_application: applicationId, p_team: teamId, p_reason: reason.data });
  if (error) return fail(friendlyDbError(error.message, "Could not remove."));
  touched(cycleId);
  return ok("Removed from the waitlist. The ranks below moved up.");
}

export async function saveOnboarding(cycleId: string, applicationId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const notes = z.string().max(1000, "At most 1000 characters").safeParse(text(formData, "onboarding_notes"));
  if (!notes.success) return fail("Please fix the highlighted fields.", { onboarding_notes: notes.error.issues[0].message });
  const { error } = await ctx.supabase.rpc("set_onboarding", {
    p_application: applicationId,
    p_team: teamId,
    p_whatsapp: formData.get("whatsapp_added") === "on",
    p_induction: formData.get("induction_attended") === "on",
    p_notes: notes.data,
  });
  if (error) return fail(friendlyDbError(error.message, "Could not save."));
  revalidatePath(`/admin/recruitment/${cycleId}/results`);
  return ok("Saved.");
}
