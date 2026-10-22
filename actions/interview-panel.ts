"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveReview } from "@/actions/review";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN, getAdminContext, type AdminContext } from "@/lib/admin/guard";
import { dailyConfigured, ensureRoom, meetingToken } from "@/lib/interview/daily";
import type { IntegrityEvent } from "@/lib/interview/shared";
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

/** An owner token for the slot's room (panel members can open it an hour either side of the slot). */
export async function joinAsPanel(slotId: string): Promise<Result<{ url: string; token: string }>> {
  const p = await panel(slotId);
  if (!p) return { ok: false, message: "You don't have permission to do this." };
  const { ctx, access } = p;
  const closes = new Date(new Date(access.ends_at).getTime() + access.grace_minutes * 60_000).toISOString();
  try {
    const room = await ensureRoom(slotId, closes);
    await ctx.supabase.rpc("record_interview_room", { p_slot: slotId, p_url: room.url });
    const token = await meetingToken({
      room: room.name,
      kind: "panel",
      userName: `${ctx.fullName || "Panel"} (Panel)`,
      userId: ctx.user.id,
      opensAt: new Date(new Date(access.starts_at).getTime() - 60 * 60_000).toISOString(),
      closesAt: new Date(new Date(access.ends_at).getTime() + 60 * 60_000).toISOString(),
    });
    await logAudit(ctx, { action: "joined_interview_room", table: "recruitment_slots", id: slotId, note: access.role });
    return { ok: true, url: room.url, token };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not open the interview room." };
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

/**
 * Interview mode for a day: Google Meet (default) or the in-website room, and
 * the room's settings. Switching on opens a room for every booked slot of the
 * day (when Daily is set up); booked candidates are told either way.
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
    early_join_minutes: text("early_join_minutes") || "10",
    grace_minutes: text("grace_minutes") || "10",
    strict_fullscreen: formData.get("strict_fullscreen") === "on",
    phone_camera: text("phone_camera") || "optional",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.room_enabled && !dailyConfigured()) {
    return fail("The interview room is not set up yet: add DAILY_API_KEY in Vercel (see the setup steps), then switch it on.");
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

  // Open the rooms now for the slots that have bookings, so the first join is quick.
  let opened = 0;
  let roomError = "";
  if (v.room_enabled) {
    const { data: slots } = await ctx.supabase
      .from("recruitment_slots")
      .select("id, ends_at, recruitment_slot_bookings!inner(status)")
      .eq("day_id", dayId)
      .in("recruitment_slot_bookings.status", ["booked", "attended"]);
    for (const slot of (slots ?? []) as { id: string; ends_at: string }[]) {
      try {
        const room = await ensureRoom(slot.id, new Date(new Date(slot.ends_at).getTime() + v.grace_minutes * 60_000).toISOString());
        await ctx.supabase.rpc("record_interview_room", { p_slot: slot.id, p_url: room.url });
        opened++;
      } catch (e) {
        roomError = e instanceof Error ? e.message : "Could not open a room.";
      }
    }
  }
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/admin/interviews", "layout");
  revalidatePath("/recruitment/status");
  revalidatePath("/recruitment/interview");
  const toldText = told ? ` ${told} candidate${told === 1 ? "" : "s"} told.` : "";
  if (roomError) return fail(`Saved, but some rooms could not be opened yet (${roomError}). They open on the first join.${toldText}`);
  return ok(
    v.room_enabled
      ? `Saved: this day uses the in-website room.${opened ? ` ${opened} room${opened === 1 ? "" : "s"} ready.` : ""}${toldText}`
      : `Saved: this day uses Google Meet.${toldText}`,
  );
}
