"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { friendlyDbError } from "@/lib/recruitment/data";
import { MEET_URL, slotTime } from "@/lib/recruitment/slots";

/**
 * Interview slots, from the admin panel. Everything here needs the
 * "recruitment" capability (admins); the database checks is_admin() again in
 * every function and policy these call.
 */

const uuid = z.string().uuid();
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

function touched(cycleId: string) {
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/apply");
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/slot");
}

// ── cycle settings ─────────────────────────────────────────────────────
const settingsSchema = z.object({
  slot_required: z.boolean(),
  cutoff_hours: z.coerce.number({ message: "Enter a number" }).int("Whole hours").min(0, "At least 0").max(72, "At most 72"),
  interview_instructions: z.string().min(1, "Write the instructions").max(1500, "Keep this under 1500 characters"),
  reporting_note: z.string().max(1000, "Keep this under 1000 characters"),
});

export async function saveSlotSettings(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success) return fail("Cycle not found.");
  const parsed = settingsSchema.safeParse({
    slot_required: formData.get("slot_required") === "on",
    cutoff_hours: text(formData, "cutoff_hours"),
    interview_instructions: text(formData, "interview_instructions"),
    reporting_note: text(formData, "reporting_note"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const values = { ...parsed.data, reporting_note: parsed.data.reporting_note || null };
  const { data: before } = await ctx.supabase
    .from("recruitment_cycles")
    .select("slot_required, cutoff_hours, interview_instructions, reporting_note")
    .eq("id", cycleId)
    .maybeSingle();
  if (!before) return fail("Cycle not found.");
  const { error } = await ctx.supabase.from("recruitment_cycles").update(values).eq("id", cycleId);
  if (error) return fail("Could not save the settings.");
  await logAudit(ctx, { action: "updated_slot_settings", table: "recruitment_cycles", id: cycleId, before, after: values });
  touched(cycleId);
  return ok("Saved.", { viewHref: "/recruitment/status" });
}

// ── days ───────────────────────────────────────────────────────────────
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00");
const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

const daySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    sessions: z
      .array(z.object({ label: z.string().max(40), start: clock, end: z.union([clock, z.literal("24:00")]) }))
      .min(1, "Add at least one session")
      .max(4),
    slot_minutes: z.coerce.number({ message: "Enter a number" }).int().min(5, "At least 5 minutes").max(120, "At most 120 minutes"),
    capacity: z.coerce.number({ message: "Enter a number" }).int().min(1, "At least 1").max(50, "At most 50"),
    mode: z.enum(["online_meet", "offline"]),
    venue: z.string().max(300),
    is_active: z.boolean(),
  })
  .superRefine((day, issue) => {
    day.sessions.forEach((s, i) => {
      if (toMinutes(s.end) <= toMinutes(s.start)) issue.addIssue({ code: "custom", path: [`session_${i}_end`], message: "Must be after the start" });
    });
    const sorted = [...day.sessions].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) issue.addIssue({ code: "custom", path: ["sessions"], message: "Sessions overlap" });
    }
    if (day.mode === "offline" && !day.venue) issue.addIssue({ code: "custom", path: ["venue"], message: "Add the venue for an in-person day" });
  });

/** Reads up to four session rows (label / start / end); empty rows are left out. */
function readSessions(formData: FormData) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const start = text(formData, `session_${i}_start`);
    const end = text(formData, `session_${i}_end`);
    if (!start && !end) continue;
    rows.push({ label: text(formData, `session_${i}_label`) || `Session ${i + 1}`, start: start.slice(0, 5), end: end.slice(0, 5) });
  }
  return rows.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export async function saveDay(cycleId: string, dayId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success) return fail("Cycle not found.");
  const parsed = daySchema.safeParse({
    date: text(formData, "date"),
    sessions: readSessions(formData),
    slot_minutes: text(formData, "slot_minutes"),
    capacity: text(formData, "capacity"),
    mode: text(formData, "mode") || "online_meet",
    venue: text(formData, "venue"),
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    if (errors.sessions && !errors.session_0_start) errors.session_0_start = errors.sessions;
    return fail("Please fix the highlighted fields.", errors);
  }
  const values = { ...parsed.data, venue: parsed.data.venue || null };

  if (!dayId) {
    const { data, error } = await ctx.supabase.from("recruitment_slot_days").insert({ ...values, cycle_id: cycleId }).select("id").single();
    if (error || !data) {
      return error?.code === "23505"
        ? fail("Please fix the highlighted fields.", { date: "This date is already added" })
        : fail("Could not add the day.");
    }
    await logAudit(ctx, { action: "created", table: "recruitment_slot_days", id: data.id as string, after: values });
    touched(cycleId);
    return ok("Day added. Press \"Generate slots\" to create its slots.", { redirectTo: `/admin/recruitment/${cycleId}/slots?day=${data.id}` });
  }

  if (!uuid.safeParse(dayId).success) return fail("Day not found.");
  const { data: before } = await ctx.supabase.from("recruitment_slot_days").select("*").eq("id", dayId).maybeSingle();
  if (!before) return fail("Day not found.");
  const { error } = await ctx.supabase.from("recruitment_slot_days").update(values).eq("id", dayId);
  if (error) return error.code === "23505" ? fail("Please fix the highlighted fields.", { date: "This date is already added" }) : fail("Could not save the day.");
  // A new seat count reaches the slots that still had the old one (not those changed one by one).
  if (before.capacity !== values.capacity) {
    await ctx.supabase.from("recruitment_slots").update({ capacity: values.capacity }).eq("day_id", dayId).eq("capacity", before.capacity);
  }
  await logAudit(ctx, { action: "updated", table: "recruitment_slot_days", id: dayId, before, after: values });
  touched(cycleId);
  const timesChanged =
    before.date !== values.date || before.slot_minutes !== values.slot_minutes || JSON.stringify(before.sessions) !== JSON.stringify(values.sessions);
  return ok(timesChanged ? "Saved. Press \"Preview\" to see what changes, then \"Generate slots\" to apply the new times." : "Saved.");
}

export async function deleteDay(cycleId: string, dayId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("delete_slot_day", { p_day: dayId });
  if (error) return fail(friendlyDbError(error.message, "Could not delete the day."));
  touched(cycleId);
  return ok("Day deleted.", { redirectTo: `/admin/recruitment/${cycleId}/slots` });
}

type Generated = {
  created: number;
  kept: number;
  removed: number;
  total: number;
  conflicts: { starts_at: string; bookings: number }[];
  /** From migration 0018: what happened to the bookings. */
  bookings?: number;
  moved?: number;
  changed?: number;
  rebook?: number;
};

const bookingsText = (r: Generated) =>
  r.bookings === undefined ? "" : ` Bookings: ${r.bookings}, ${r.moved ?? 0} moved, ${r.changed ?? 0} told their new time, ${r.rebook ?? 0} need rebooking.`;

/** Re-cuts the day from its saved settings. Every booking is kept (moved into the new slot that covers its time). */
export async function generateSlots(cycleId: string, dayId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("generate_slots", { p_day: dayId });
  if (error) return fail(friendlyDbError(error.message, "Could not generate the slots."));
  const r = data as Generated;
  touched(cycleId);
  const parts = [`${r.total} slots on this day`, `${r.created} new`, `${r.kept} kept`];
  if (r.removed) parts.push(`${r.removed} removed`);
  const conflicts = r.conflicts.length
    ? ` ${r.conflicts.length} slot${r.conflicts.length === 1 ? "" : "s"} outside the new times still hold bookings and were kept: ${r.conflicts.map((c) => slotTime(c.starts_at)).join(", ")}. Move those candidates, then generate again.`
    : "";
  return conflicts ? fail(`${parts.join(", ")}.${conflicts}`) : ok(`${parts.join(", ")}.${bookingsText(r)}`, { viewHref: "/recruitment" });
}

/** Dry run of Generate: the same steps, rolled back. Nothing changes and nobody is notified. */
export async function previewSlots(cycleId: string, dayId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("preview_slot_timings", { p_day: dayId });
  if (error) return fail(friendlyDbError(error.message, "Could not preview. Has migration 0018 been run?"));
  const r = data as Generated;
  await logAudit(ctx, { action: "previewed_slots", table: "recruitment_slot_days", id: dayId, note: bookingsText(r).trim() });
  return ok(`Preview only, nothing changed: ${r.total} slots (${r.created} new, ${r.removed} removed).${bookingsText(r)}`);
}

// ── slots ──────────────────────────────────────────────────────────────
export async function setSlotBlocked(cycleId: string, slotId: string, blocked: boolean): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.from("recruitment_slots").update({ is_blocked: blocked }).eq("id", slotId).select("starts_at");
  if (error || !data?.length) return fail("Could not change the slot.");
  await logAudit(ctx, { action: blocked ? "blocked_slot" : "unblocked_slot", table: "recruitment_slots", id: slotId, note: slotTime(String(data[0].starts_at)) });
  touched(cycleId);
  return ok(blocked ? "Slot blocked. People already in it keep their booking." : "Slot open again.");
}

export async function setSlotCapacity(cycleId: string, slotId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const parsed = z.coerce.number({ message: "Enter a number" }).int().min(0, "At least 0").max(50, "At most 50").safeParse(text(formData, "capacity"));
  if (!parsed.success) return fail("Please fix the highlighted fields.", { capacity: parsed.error.issues[0]?.message ?? "Enter a number" });
  const { data: before } = await ctx.supabase.from("recruitment_slots").select("capacity, starts_at").eq("id", slotId).maybeSingle();
  if (!before) return fail("Slot not found.");
  const { error } = await ctx.supabase.from("recruitment_slots").update({ capacity: parsed.data }).eq("id", slotId);
  if (error) return fail("Could not change the seats.");
  await logAudit(ctx, { action: "updated", table: "recruitment_slots", id: slotId, before: { capacity: before.capacity }, after: { capacity: parsed.data }, note: slotTime(String(before.starts_at)) });
  touched(cycleId);
  return ok(`Seats set to ${parsed.data}.`);
}

// ── Meet links ─────────────────────────────────────────────────────────
/** "meet.google.com/abc-defg-hij?authuser=0" → "https://meet.google.com/abc-defg-hij". */
function normaliseMeetUrl(value: string): string {
  let url = value.trim().toLowerCase().split(/[?#]/)[0].replace(/\/+$/, "");
  if (url.startsWith("meet.google.com/")) url = `https://${url}`;
  return url;
}

/** Saves (or, when empty, removes) the Meet link of a day, or of one slot of it. Never written to the audit log. */
export async function saveMeetLink(cycleId: string, dayId: string, slotId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(dayId).success || (slotId && !uuid.safeParse(slotId).success)) return fail("Not found.");
  const raw = text(formData, "meet_url");
  const url = raw ? normaliseMeetUrl(raw) : "";
  if (url && !MEET_URL.test(url)) return fail("Please fix the highlighted fields.", { meet_url: "Use a Google Meet link like https://meet.google.com/abc-defg-hij" });

  let existing = ctx.supabase.from("recruitment_meet_links").select("id").eq("day_id", dayId);
  existing = slotId ? existing.eq("slot_id", slotId) : existing.is("slot_id", null);
  const { data: row } = await existing.maybeSingle();

  let error;
  if (!url) {
    if (!row) return ok("No link to remove.");
    ({ error } = await ctx.supabase.from("recruitment_meet_links").delete().eq("id", row.id));
  } else if (row) {
    ({ error } = await ctx.supabase.from("recruitment_meet_links").update({ meet_url: url }).eq("id", row.id));
  } else {
    ({ error } = await ctx.supabase.from("recruitment_meet_links").insert({ day_id: dayId, slot_id: slotId, meet_url: url, created_by: ctx.user.id }));
  }
  if (error) return fail("Could not save the link.");
  await logAudit(ctx, { action: url ? "set_meet_link" : "removed_meet_link", table: slotId ? "recruitment_slots" : "recruitment_slot_days", id: slotId ?? dayId });
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/recruitment/status");
  return ok(url ? "Link saved. Candidates see it only after you publish it, on the interview day." : "Link removed.");
}

export async function publishMeetLinks(cycleId: string, dayId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("publish_meet_links", { p_day: dayId });
  if (error) return fail(friendlyDbError(error.message, "Could not publish the link."));
  const r = data as { notified: number; missing_links: number };
  touched(cycleId);
  deliverEmailsAfterResponse();
  const warning = r.missing_links ? ` ${r.missing_links} booked slot${r.missing_links === 1 ? " has" : "s have"} no link yet.` : "";
  return ok(`Published. ${r.notified} candidate${r.notified === 1 ? "" : "s"} told.${warning}`, { viewHref: "/recruitment/status" });
}

// ── bookings ───────────────────────────────────────────────────────────
export async function moveBooking(cycleId: string, bookingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const slot = text(formData, "slot");
  if (!uuid.safeParse(slot).success) return fail("Please fix the highlighted fields.", { slot: "Choose a slot" });
  const { error } = await ctx.supabase.rpc("admin_move_booking", { p_booking: bookingId, p_slot: slot, p_override: formData.get("override") === "on" });
  if (error) {
    return error.message === "Slot full"
      ? fail("Please fix the highlighted fields.", { slot: "That slot is full. Tick \"Allow over capacity\" to move anyway." })
      : fail(friendlyDbError(error.message, "Could not move the booking."));
  }
  touched(cycleId);
  deliverEmailsAfterResponse();
  return ok("Moved. The candidate has been told.");
}

export async function cancelBooking(cycleId: string, bookingId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("admin_cancel_booking", { p_booking: bookingId });
  if (error) return fail(friendlyDbError(error.message, "Could not cancel the booking."));
  touched(cycleId);
  deliverEmailsAfterResponse();
  return ok("Booking cancelled. The candidate has been told.");
}

export async function setBookingStatus(cycleId: string, bookingId: string, status: "booked" | "attended" | "no_show"): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc("admin_set_booking_status", { p_booking: bookingId, p_status: status });
  if (error) return fail(friendlyDbError(error.message, "Could not update the booking."));
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok(status === "attended" ? "Marked as attended." : status === "no_show" ? "Marked as no-show." : "Marked as booked.");
}

export async function remindUnbooked(cycleId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase.rpc("remind_unbooked", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not send the reminder."));
  deliverEmailsAfterResponse();
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok(data ? `Reminder sent to ${data} candidate${data === 1 ? "" : "s"}.` : "Everyone already has a slot.");
}
