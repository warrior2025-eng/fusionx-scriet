"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { friendlyDbError } from "@/lib/recruitment/shared";

/**
 * Meetings, from the admin panel. The database checks the role again, works out who is
 * invited, writes the notifications (which also go out as email) and the audit entries.
 */

const uuid = z.string().uuid();

const audience = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("core_group"), id: uuid }),
      z.object({ kind: z.literal("role"), id: z.enum(["admins", "reviewers"]) }),
      z.object({ kind: z.literal("team"), id: uuid }),
      z.object({ kind: z.literal("person"), id: uuid }),
    ]),
  )
  .min(1, "Choose who the meeting is for")
  .max(200, "That is too many entries");

const saveSchema = z.object({
  title: z.string().trim().min(3, "Give the meeting a title").max(160, "Keep the title under 160 characters"),
  description: z.string().trim().max(2000, "Keep the description under 2000 characters"),
  starts_at: z.string().datetime({ offset: true, message: "Choose the date and start time" }),
  duration_min: z.number().int().min(15, "The shortest meeting is 15 minutes").max(180, "The longest meeting is 180 minutes"),
  audience,
  cohosts: z.array(uuid).max(50),
  agenda: z.array(z.object({ title: z.string().trim().min(1, "Each agenda item needs a title").max(200), minutes: z.number().int().min(1).max(180).nullable() })).max(40),
  lobby_on: z.boolean(),
  join_muted: z.boolean(),
  join_camera_off: z.boolean().nullable(),
  screen_share_all: z.boolean(),
  chat_on: z.boolean(),
  repeat_weeks: z.number().int().min(1).max(26),
});

export type MeetingInput = z.input<typeof saveSchema>;

function touched(id?: string) {
  deliverEmailsAfterResponse();
  revalidatePath("/admin/meetings");
  revalidatePath("/meetings");
  if (id) revalidatePath(`/meetings/${id}`);
}

export async function saveMeeting(id: string | null, input: MeetingInput): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  if (id && !uuid.safeParse(id).success) return fail("That meeting no longer exists.");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { data, error } = await ctx.supabase.rpc("meeting_save", { p_id: id, p: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not save the meeting."));
  const saved = data as { id: string; invited: number; moved?: boolean };
  touched(saved.id);
  return ok(id ? (saved.moved ? "Rescheduled. Everyone has been told." : "Meeting saved.") : `Meeting created. ${saved.invited} people have their pass.`, { redirectTo: "/admin/meetings" });
}

const instantSchema = z.object({ title: z.string().trim().min(3, "Give the meeting a title").max(160), audience });

/** Starts now: invitees get a ring. */
export async function startInstantMeeting(input: z.input<typeof instantSchema>): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  const parsed = instantSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { data, error } = await ctx.supabase.rpc("meeting_start_instant", { p: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not start the meeting."));
  const started = data as { id: string; invited: number };
  touched(started.id);
  return ok(`Calling ${Math.max(0, started.invited - 1)} people.`, { redirectTo: `/meetings/${started.id}?enter=1` });
}

export async function cancelMeeting(id: string): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("That meeting no longer exists.");
  const { error } = await ctx.supabase.rpc("meeting_cancel", { p_id: id });
  if (error) return fail(friendlyDbError(error.message, "Could not cancel the meeting."));
  touched(id);
  return ok("Meeting cancelled. Everyone has been told.", { redirectTo: "/admin/meetings" });
}

export type MeetingPerson = { id: string; full_name: string; email: string; department: string | null; year: string | null };

/** Website users by name or email, for specific people and co-hosts. Uses the same search as Core teams. */
export async function searchMeetingPeople(q: string): Promise<{ results: MeetingPerson[]; error?: string }> {
  const ctx = await authorize("meetings");
  if (!ctx) return { results: [], error: FORBIDDEN.message };
  const { data, error } = await ctx.supabase.rpc("admin_search_core_users", { p_group: "00000000-0000-0000-0000-000000000000", p_q: q.slice(0, 100) });
  if (error) return { results: [], error: "The search did not work. Please try again." };
  return { results: (data ?? []) as MeetingPerson[] };
}
