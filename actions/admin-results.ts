"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { isUpload, uploadImage } from "@/lib/admin/storage";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { fromIstInput } from "@/lib/events/format";
import { friendlyDbError } from "@/lib/recruitment/data";
import { linkField } from "@/lib/validation/link";

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
/**
 * Saves the board for one hub: only the rows the admin changed, and the ticked rows set to the
 * bulk decision. Each says what it was showing; a row that has moved since is refused, not overwritten.
 */
export async function saveDecisions(cycleId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const ticked = new Set(formData.getAll("ids").filter((v): v is string => typeof v === "string"));
  const bulk = text(formData, "bulk_decision");
  if (bulk && !(DECISIONS as readonly string[]).includes(bulk)) return fail("Choose a decision for the ticked rows.");
  if (bulk && ticked.size === 0) return fail("Tick the rows to set, or clear the bulk decision.");

  const rows = new Set([...formData.getAll("row"), ...(bulk ? ticked : [])].filter((v): v is string => typeof v === "string" && uuid.safeParse(v).success));
  let saved = 0;
  const errors: string[] = [];
  for (const id of [...rows].slice(0, 400)) {
    const inBulk = Boolean(bulk) && ticked.has(id);
    const original = text(formData, `orig_${id}`) || "undecided";
    const decision = inBulk ? bulk : text(formData, `dec_${id}`) || original;
    const message = formData.has(`msg_${id}`) ? text(formData, `msg_${id}`) : null;
    if (!(DECISIONS as readonly string[]).includes(decision) || !(DECISIONS as readonly string[]).includes(original)) {
      errors.push("One row had an unknown decision.");
      continue;
    }
    if (message && message.length > 1000) {
      errors.push("A message can be at most 1000 characters.");
      continue;
    }
    if (decision === original && message === null) continue;
    const { error } = await ctx.supabase.rpc("set_final_decision", {
      p_application: id,
      p_team: teamId,
      p_decision: decision,
      p_note: message,
      p_reason: text(formData, `why_${id}`).slice(0, 300) || null,
      p_hubs: text(formData, `hubs_${id}`) || null,
      p_hubs_reason: text(formData, `hubswhy_${id}`).slice(0, 300) || null,
      p_expected: original,
      p_source: inBulk ? "bulk" : "board",
    });
    if (error) errors.push(`${text(formData, `name_${id}`) || "One row"}: ${friendlyDbError(error.message, "Could not save this decision.")}`);
    else saved++;
  }
  touched(cycleId);
  if (errors.length) return fail(`${saved ? `${saved} saved. ` : "Nothing saved. "}${[...new Set(errors)].slice(0, 5).join(" ")}`);
  return ok(saved ? `${saved} decision${saved === 1 ? "" : "s"} saved.` : "No changes to save.");
}

/** When the decisions last changed, so a board can tell it is behind. */
export async function getBoardStamp(cycleId: string): Promise<string | null> {
  const ctx = await admin(cycleId);
  if (!ctx) return null;
  const { data } = await ctx.supabase.rpc("results_board_stamp", { p_cycle: cycleId });
  return (data as string | null) ?? null;
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

// ── correcting published results (super admins) ────────────────────────
const correctionSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500),
  items: z
    .array(z.object({ application_id: uuid, team_id: uuid, from: z.enum(["undecided", "selected", "waitlisted", "not_selected", "none"]), to: z.enum(["selected", "not_selected"]) }))
    .min(1, "There is nothing to change")
    .max(500),
  notices: z.array(z.object({ application_id: uuid, message: z.string().trim().min(1, "Write the message, or untick the person").max(1000) })).max(500),
});

export async function applyCorrections(cycleId: string, input: z.input<typeof correctionSchema>): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !ctx.roles.includes("super_admin")) return FORBIDDEN;
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { data, error } = await ctx.supabase.rpc("apply_result_corrections", { p_cycle: cycleId, p_reason: parsed.data.reason, p_items: parsed.data.items, p_notices: parsed.data.notices });
  if (error) return fail(friendlyDbError(error.message, "Could not apply the corrections. Nothing was changed."));
  touched(cycleId);
  const done = data as { changed: number; told: number };
  return ok(`${done.changed} corrected. ${done.told} ${done.told === 1 ? "person" : "people"} told.`);
}

// ── the public page: poster and how long it stays ──────────────────────
const publicSchema = z.object({
  results_poster_alt: z.string().trim().min(3, "Describe the poster (required)").max(200, "At most 200 characters"),
  results_poster_only: z.boolean(),
  results_hide_after_days: z.coerce.number({ message: "Enter a number of days" }).int("Enter a whole number of days").min(1, "At least 1 day").max(365, "At most 365 days"),
});

export async function saveResultsPublic(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const parsed = publicSchema.safeParse({
    results_poster_alt: text(formData, "results_poster_alt"),
    results_poster_only: formData.get("results_poster_only") === "on",
    results_hide_after_days: text(formData, "results_hide_after_days"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { data: before } = await ctx.supabase.from("recruitment_cycles").select("results_poster_url, results_poster_alt, results_poster_only, results_hide_after_days").eq("id", cycleId).maybeSingle();
  if (!before) return fail("Cycle not found.");
  const values: Record<string, unknown> = { ...parsed.data };
  const file = formData.get("results_poster");
  if (isUpload(file)) {
    const uploaded = await uploadImage(ctx.supabase, "site-assets", file, "results-poster");
    if ("error" in uploaded) return fail("Please fix the highlighted fields.", { results_poster: uploaded.error });
    values.results_poster_url = uploaded.url;
  } else if (formData.get("results_poster__remove") === "on") {
    values.results_poster_url = null;
  }
  const { error } = await ctx.supabase.from("recruitment_cycles").update(values).eq("id", cycleId);
  if (error) return fail(friendlyDbError(error.message, "Could not save."));
  await logAudit(ctx, { action: "updated_results_public", table: "recruitment_cycles", id: cycleId, before, after: values });
  touched(cycleId);
  return ok("Saved.", { viewHref: "/recruitment/results" });
}

export async function setResultsPublic(cycleId: string, value: "hidden" | "shown"): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("results_set_public_override", { p_cycle: cycleId, p_value: value });
  if (error) return fail(friendlyDbError(error.message, "Could not change this."));
  touched(cycleId);
  return ok(value === "hidden" ? "The public results are hidden." : "The public results are showing again.");
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
  one_hub_mode: z.enum(["not_selected", "keep_waitlisted", "allow_multiple"]),
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
  induction_link: linkField("Meeting link", "any", { max: 300 }),
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

/** After the results: a selected candidate is selected in one more hub they applied to. The reason is only for an absent candidate. */
export async function selectAdditionalHub(cycleId: string, applicationId: string, teamId: string, _prev?: ActionState, formData?: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const reason = z.string().trim().max(300, "At most 300 characters").safeParse(formData ? text(formData, "reason") : "");
  if (!reason.success) return fail("Please fix the highlighted fields.", { reason: reason.error.issues[0].message });
  const { error } = await ctx.supabase.rpc("select_additional_hub", { p_application: applicationId, p_team: teamId, p_reason: reason.data || null });
  if (error) return fail(friendlyDbError(error.message, "Could not select them in that hub."));
  touched(cycleId);
  return ok("Selected. They have been notified, and the public lists are updated.", { viewHref: "/recruitment/results" });
}

/** A hub the candidate did not apply to, with a reason. Before the results nothing is sent; after them they are told once. */
export async function selectUnappliedHub(cycleId: string, applicationId: string, teamId: string, reason: string, keep: boolean): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(applicationId).success || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const why = z.string().trim().min(3, "Give a short reason").max(300, "At most 300 characters").safeParse(reason);
  if (!why.success) return fail(why.error.issues[0].message);
  const { data, error } = await ctx.supabase.rpc("select_unapplied_hub", { p_application: applicationId, p_team: teamId, p_reason: why.data, p_keep: keep });
  if (error) return fail(friendlyDbError(error.message, "Could not select them in that hub."));
  touched(cycleId);
  return ok((data as { notified?: boolean } | null)?.notified ? "Selected. They have been notified, and the public lists are updated." : "Selected. Nothing is sent before the results.");
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

// ── the post-result task (migration 0021) ──────────────────────────────
const httpsLink = linkField("Submission link", "any");
const taskSchema = z.object({
  title: z.string().trim().min(2, "Add a title").max(200, "At most 200 characters"),
  description: z.string().trim().max(4000, "At most 4000 characters"),
  deadline: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Pick a date and time"),
  link: httpsLink,
  is_published: z.boolean(),
});

/**
 * One task per hub, for the candidates selected into it. Candidates see it
 * only after the results are out (the database decides); once it is
 * published and the results are out, they are notified.
 */
export async function saveHubTask(cycleId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(teamId).success) return FORBIDDEN;
  const parsed = taskSchema.safeParse({
    title: text(formData, "task_title"),
    description: text(formData, "task_description"),
    deadline: text(formData, "task_deadline"),
    link: text(formData, "task_link"),
    is_published: formData.get("task_published") === "on",
  });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    return fail("Please fix the highlighted fields.", Object.fromEntries(Object.entries(errors).map(([k, v]) => [`task_${k === "is_published" ? "published" : k}`, v])));
  }
  const v = parsed.data;
  const { data: team } = await ctx.supabase.from("recruitment_teams").select("id, name").eq("id", teamId).eq("cycle_id", cycleId).maybeSingle();
  if (!team) return fail("Hub not found.");
  const { data: before } = await ctx.supabase.from("recruitment_hub_tasks").select("*").eq("team_id", teamId).maybeSingle();
  const values = {
    team_id: teamId,
    title: v.title,
    description: v.description || null,
    deadline: v.deadline ? fromIstInput(v.deadline) : null,
    link: v.link || null,
    is_published: v.is_published,
    published_at: v.is_published ? (before?.published_at ?? new Date().toISOString()) : null,
    updated_by: ctx.user.id,
  };
  const { error } = await ctx.supabase.from("recruitment_hub_tasks").upsert(values, { onConflict: "team_id" });
  if (error) return fail(friendlyDbError(error.message, "Could not save the task. Has migration 0021 been run?"));
  // Tells the selected candidates now if the results are already out (does nothing before).
  const { data: told } = v.is_published ? await ctx.supabase.rpc("recruitment_notify_tasks", { p_cycle: cycleId }) : { data: 0 };
  await logAudit(ctx, {
    action: before ? "updated_hub_task" : "created_hub_task",
    table: "recruitment_hub_tasks",
    id: teamId,
    before,
    after: values,
    note: `${team.name}: "${v.title}", ${v.is_published ? "published" : "draft"}${told ? `; ${told} candidate(s) notified` : ""}`,
  });
  touched(cycleId);
  return ok(
    v.is_published
      ? told
        ? `Saved and published. ${told} selected candidate(s) notified.`
        : "Saved and published. Selected candidates see it, and are notified, once the results are out."
      : "Saved as a draft. Candidates do not see it until you publish it.",
  );
}

/** Marks a candidate's task reviewed (or back to submitted). */
export async function setTaskReviewed(cycleId: string, teamId: string, applicationId: string, reviewed: boolean): Promise<ActionState> {
  const ctx = await admin(cycleId);
  if (!ctx || !uuid.safeParse(teamId).success || !uuid.safeParse(applicationId).success) return FORBIDDEN;
  const { data, error } = await ctx.supabase
    .from("recruitment_task_submissions")
    .update(reviewed ? { status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: ctx.user.id } : { status: "submitted", reviewed_at: null, reviewed_by: null })
    .eq("team_id", teamId)
    .eq("application_id", applicationId)
    .neq("status", "not_started")
    .select("application_id");
  if (error) return fail(friendlyDbError(error.message, "Could not save."));
  if (!data?.length) return fail("This candidate has not submitted the task yet.");
  await logAudit(ctx, { action: reviewed ? "reviewed_hub_task" : "reopened_hub_task", table: "recruitment_task_submissions", id: applicationId, note: teamId });
  revalidatePath(`/admin/recruitment/${cycleId}/results`);
  return ok(reviewed ? "Marked reviewed." : "Marked not reviewed.");
}
