"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveReview } from "@/actions/review";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN, getAdminContext, type AdminContext } from "@/lib/admin/guard";
import { bookingOf, cleanUpDayRoom } from "@/lib/interview/day-room";
import { accessToken, listParticipants, roomConfigured, roomNameForDay } from "@/lib/interview/livekit";
import { DEFAULT_CHECKLIST, type DayAccess, type IntegrityEvent } from "@/lib/interview/shared";
import { friendlyDbError } from "@/lib/recruitment/data";

/**
 * The interview panel: admins ("recruitment"), and a hub's reviewers for the
 * slots that include one of their candidates (read-only integrity and their
 * own scores). interview_panel_access in the database decides who is who;
 * every action here asks it again. Panel actions are written to audit_logs.
 */

const uuid = z.string().uuid();
type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

export type PanelAccess = {
  role: "admin" | "reviewer";
  teams?: string[];
  slot_id: string;
  cycle_id: string;
  day_id: string;
  day: string;
  mode: string;
  starts_at: string;
  ends_at: string;
  room_enabled: boolean;
  early_join_minutes: number;
  grace_minutes: number;
  strict_fullscreen: boolean;
  phone_camera: "off" | "optional" | "required";
};

async function panel(slotId: string): Promise<{ ctx: AdminContext; access: PanelAccess } | null> {
  if (!uuid.safeParse(slotId).success) return null;
  const ctx = await getAdminContext();
  if (!ctx.user) return null;
  const { data } = await ctx.supabase.rpc("interview_panel_access", { p_slot: slotId });
  if (!data) return null;
  return { ctx: ctx as AdminContext, access: data as PanelAccess };
}

/** The panel's access to a whole interview day (migration 0024), asked of the database each time. */
async function dayPanel(dayId: string): Promise<{ ctx: AdminContext; access: DayAccess } | null> {
  if (!uuid.safeParse(dayId).success) return null;
  const ctx = await getAdminContext();
  if (!ctx.user) return null;
  const { data } = await ctx.supabase.rpc("interview_day_access", { p_day: dayId });
  if (!data) return null;
  return { ctx: ctx as AdminContext, access: data as DayAccess };
}

/**
 * A room-admin token for the day's one room, for the panel. Valid all day:
 * from half an hour before the first slot's join time until an hour after the
 * last slot (panel members may set up early; candidates are never let in
 * outside their own slot).
 */
export async function joinDayRoom(dayId: string): Promise<Result<{ serverUrl: string; token: string }>> {
  const p = await dayPanel(dayId);
  if (!p) return { ok: false, message: "You don't have permission to do this." };
  const { ctx, access } = p;
  if (!access.room_enabled) return { ok: false, message: "This day uses Google Meet. Switch it to the in-website room on the Interview slots page to use this call." };
  const first = access.slots[0];
  const last = access.slots.at(-1);
  if (!first || !last) return { ok: false, message: "This day has no slots yet." };
  const min = 60_000;
  try {
    const { serverUrl, token } = accessToken({
      room: roomNameForDay(dayId),
      kind: "panel",
      identity: `panel-${ctx.user.id}`,
      name: `${ctx.fullName || "Panel"} (Panel)`,
      opensAt: new Date(new Date(first.starts_at).getTime() - (access.early_join_minutes + 30) * min).toISOString(),
      closesAt: new Date(new Date(last.ends_at).getTime() + (access.grace_minutes + 60) * min).toISOString(),
    });
    await logAudit(ctx, { action: "joined_interview_room", table: "recruitment_slot_days", id: dayId, note: access.role });
    return { ok: true, serverUrl, token };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not open the interview room." };
  }
}

/** The day room's token, opened from a slot's panel page (the slot's day has one room). */
export async function joinAsPanel(slotId: string): Promise<Result<{ serverUrl: string; token: string }>> {
  const p = await panel(slotId);
  if (!p) return { ok: false, message: "You don't have permission to do this." };
  return joinDayRoom(p.access.day_id);
}

export type DayRoomNow = { panel: number; candidates: number; phones: number; removed: number; at: string; live: boolean; present: string[] };

/**
 * Removes everyone whose slot is over (or not started, or whose day went back
 * to Google Meet) from the day room. Run by every open panel screen every 15
 * seconds and at each slot boundary, and by the admin's button. Each removal
 * is logged by the database (integrity event + audit entry).
 */
export async function enforceDayRoom(dayId: string): Promise<Result<DayRoomNow>> {
  const p = await dayPanel(dayId);
  if (!p) return { ok: false, message: "You don't have permission to do this." };
  try {
    const r = await cleanUpDayRoom(p.ctx.supabase, dayId);
    return {
      ok: true,
      panel: r.panel,
      candidates: r.candidates,
      phones: r.phones,
      removed: r.removed,
      at: new Date().toISOString(),
      live: r.participants.length > 0,
      present: r.participants.map((x) => x.identity),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not check the room." };
  }
}

/**
 * The panel takes a candidate (and their phone camera) out of the day room for
 * the rest of their slot, with a reason; they cannot rejoin. The database
 * checks the caller is on that day's panel and writes the timeline entry and
 * the audit log (migration 0025).
 */
export async function removeFromRoom(bookingId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const parsed = z.object({ booking: uuid, reason: z.string().trim().min(3, "Give a reason").max(300) }).safeParse({ booking: bookingId, reason });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Give a reason." };
  const ctx = await getAdminContext();
  if (!ctx.user) return { ok: false, message: "Please sign in." };
  const { data: dayId, error } = await ctx.supabase.rpc("panel_remove_candidate", { p_booking: parsed.data.booking, p_reason: parsed.data.reason });
  if (error || !dayId) return { ok: false, message: friendlyDbError(error?.message ?? "", "Could not remove this candidate. Has migration 0025 been run?") };
  try {
    await cleanUpDayRoom(ctx.supabase, String(dayId));
  } catch {
    // The next clean-up (within 15 seconds) takes them out.
  }
  revalidatePath("/admin/interviews", "layout");
  revalidatePath("/review/interviews", "layout");
  return { ok: true, message: "Removed. They cannot rejoin this slot." };
}

/** Who is in the day room now, and the last clean-up (for the admin's "Room status" box). Reads only. */
export async function dayRoomStatus(dayId: string): Promise<Result<Omit<DayRoomNow, "removed" | "at" | "present"> & { lastRun: string | null; removedTotal: number }>> {
  const ctx = await authorize("recruitment");
  if (!ctx || !uuid.safeParse(dayId).success) return { ok: false, message: "You don't have permission to do this." };
  if (!roomConfigured()) return { ok: false, message: "The LiveKit keys are not set on the server." };
  const { data } = await ctx.supabase.rpc("interview_day_access", { p_day: dayId });
  const access = data as DayAccess | null;
  try {
    const people = await listParticipants(roomNameForDay(dayId));
    const kinds = people.map((x) => bookingOf(x)?.who ?? "panel");
    return {
      ok: true,
      live: people.length > 0,
      panel: kinds.filter((k) => k === "panel").length,
      candidates: kinds.filter((k) => k === "candidate").length,
      phones: kinds.filter((k) => k === "phone").length,
      lastRun: access?.last_enforced_at ?? null,
      removedTotal: access?.removed_total ?? 0,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not read the room." };
  }
}

/** Integrity events of the slot after `sinceId` (a reviewer gets only their candidates', by RLS). */
export async function slotEvents(slotId: string, sinceId = 0): Promise<IntegrityEvent[]> {
  const p = await panel(slotId);
  if (!p) return [];
  const { data } = await p.ctx.supabase
    .from("recruitment_integrity_events")
    .select("id, booking_id, type, occurred_at, detail")
    .eq("slot_id", slotId)
    .gt("id", Math.max(0, Math.floor(sinceId)))
    .order("id")
    .limit(500);
  return (data ?? []) as IntegrityEvent[];
}

/** Ids of the questions already revealed to the slot. */
export async function revealedIds(slotId: string): Promise<string[]> {
  const p = await panel(slotId);
  if (!p) return [];
  const { data } = await p.ctx.supabase.from("recruitment_question_reveals").select("question_id").eq("slot_id", slotId);
  return (data ?? []).map((r) => r.question_id as string);
}

/** Shows a question from the bank to the slot's candidates (admins). */
export async function revealQuestion(slotId: string, questionId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx || !uuid.safeParse(slotId).success || !uuid.safeParse(questionId).success) return FORBIDDEN;
  const { error } = await ctx.supabase.from("recruitment_question_reveals").insert({ slot_id: slotId, question_id: questionId, revealed_by: ctx.user.id });
  if (error && error.code !== "23505") return fail(friendlyDbError(error.message, "Could not reveal the question."));
  await logAudit(ctx, { action: "revealed_interview_question", table: "recruitment_question_reveals", id: slotId, note: questionId });
  return ok("Shown to the candidates.");
}

/** Takes a revealed question off the candidates' screens (admins). */
export async function hideQuestion(slotId: string, questionId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx || !uuid.safeParse(slotId).success || !uuid.safeParse(questionId).success) return FORBIDDEN;
  const { error } = await ctx.supabase.from("recruitment_question_reveals").delete().eq("slot_id", slotId).eq("question_id", questionId);
  if (error) return fail(friendlyDbError(error.message, "Could not hide the question."));
  await logAudit(ctx, { action: "hid_interview_question", table: "recruitment_question_reveals", id: slotId, note: questionId });
  return ok("Hidden.");
}

/** The existing review (score + notes), with the rubric, from the panel. Logged. */
export async function savePanelReview(slotId: string, applicationId: string, teamId: string, prev: ActionState, formData: FormData): Promise<ActionState> {
  const p = await panel(slotId);
  if (!p) return FORBIDDEN;
  const result = await saveReview(applicationId, teamId, prev, formData);
  if (result.status === "success") {
    await logAudit(p.ctx, { action: "scored_interview", table: "recruitment_reviews", id: applicationId, note: teamId });
    revalidatePath(`/admin/interviews/${slotId}`);
    revalidatePath(`/review/interviews/${slotId}`);
  }
  return result;
}

// ── room settings per day (admins) ─────────────────────────────────────
const settingsSchema = z.object({
  room_enabled: z.boolean(),
  early_join_minutes: z.coerce.number({ message: "Enter a number" }).int("Whole minutes").min(0, "At least 0").max(60, "At most 60"),
  grace_minutes: z.coerce.number({ message: "Enter a number" }).int("Whole minutes").min(0, "At least 0").max(60, "At most 60"),
  strict_fullscreen: z.boolean(),
  phone_camera: z.enum(["off", "optional", "required"]),
});

// The day's rules for candidates (migration 0025).
const rulesSchema = z.object({
  allow_phones: z.boolean(),
  warn_on_leave: z.boolean(),
  auto_remove: z.boolean(),
  auto_remove_leaves: z.coerce.number({ message: "Enter a number" }).int("A whole number").min(1, "At least 1").max(20, "At most 20"),
  auto_remove_seconds: z.coerce.number({ message: "Enter a number" }).int("Whole seconds").min(5, "At least 5").max(600, "At most 600"),
  candidate_checklist: z.string().trim().max(2000, "Keep it under 2000 characters"),
});

/**
 * Interview mode for a day: Google Meet (default) or the in-website room (one
 * room for the whole day), and the room's settings. Switching on needs the
 * LiveKit keys; booked candidates are told either way.
 */
export async function saveRoomSettings(cycleId: string, dayId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success || !uuid.safeParse(dayId).success) return fail("Day not found.");
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const parsed = settingsSchema.safeParse({
    room_enabled: text("interview_mode") === "room",
    early_join_minutes: text("early_join_minutes") || "0",
    grace_minutes: text("grace_minutes") || "0",
    strict_fullscreen: formData.get("strict_fullscreen") === "on",
    phone_camera: text("phone_camera") || "optional",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.room_enabled && !roomConfigured()) {
    return fail("The interview room is not set up yet: add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel (see the setup steps), then switch it on.");
  }
  const { data, error } = await ctx.supabase.rpc("set_interview_room_settings", {
    p_day: dayId,
    p_enabled: v.room_enabled,
    p_early: v.early_join_minutes,
    p_grace: v.grace_minutes,
    p_strict: v.strict_fullscreen,
    p_phone: v.phone_camera,
  });
  if (error) return fail(friendlyDbError(error.message, "Could not save. Has migration 0023 been run?"));
  const told = (data as { notified?: number } | null)?.notified ?? 0;

  if (formData.has("rules")) {
    const rules = rulesSchema.safeParse({
      allow_phones: formData.get("allow_phones") === "on",
      warn_on_leave: formData.get("warn_on_leave") === "on",
      auto_remove: formData.get("auto_remove") === "on",
      auto_remove_leaves: text("auto_remove_leaves") || "3",
      auto_remove_seconds: text("auto_remove_seconds") || "30",
      // Browsers send textarea lines as CR LF; the default text uses LF.
      candidate_checklist: text("candidate_checklist").replace(/\r\n?/g, "\n"),
    });
    if (!rules.success) return fail("Please fix the highlighted fields.", zodFieldErrors(rules.error));
    const r = rules.data;
    const { error: rulesError } = await ctx.supabase.rpc("set_interview_room_rules", {
      p_day: dayId,
      p_allow_phones: r.allow_phones,
      p_warn: r.warn_on_leave,
      p_auto: r.auto_remove,
      p_leaves: r.auto_remove_leaves,
      p_seconds: r.auto_remove_seconds,
      // The default text is kept as "no text" so a later change of the default reaches this day too.
      p_checklist: r.candidate_checklist === DEFAULT_CHECKLIST ? "" : r.candidate_checklist,
    });
    if (rulesError) return fail(friendlyDbError(rulesError.message, "The mode was saved, but not the rules for leaving the screen. Has migration 0025 been run?"));
  }

  // LiveKit opens the day's room on the first join; nothing to create here.
  // Back on Google Meet: take the candidates out of the room now (the panel stays).
  if (!v.room_enabled && roomConfigured()) {
    try {
      await cleanUpDayRoom(ctx.supabase, dayId);
    } catch {
      // Their own page moves them to Meet within 15 seconds anyway.
    }
  }
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/admin/interviews", "layout");
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/interview");
  const toldText = told ? ` ${told} candidate${told === 1 ? "" : "s"} told.` : "";
  return ok(v.room_enabled ? `Saved: this day uses the in-website room.${toldText}` : `Saved: this day uses Google Meet.${toldText}`);
}
