"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { roomConfigured } from "@/lib/interview/livekit";
import { endRoom } from "@/lib/meetings/livekit";
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
      z.object({ kind: z.literal("org_category"), id: z.enum(["founder", "faculty_guide", "senior_mentor", "core_team", "advisor"]) }),
    ]),
  )
  .max(1000, "That is too many entries");

const emails = z.array(z.string().trim().toLowerCase().pipe(z.email("Check the email addresses"))).max(200, "At most 200 email invites per meeting");
const someone = (v: { audience: unknown[]; emails: unknown[] }) => v.audience.length + v.emails.length > 0;
const SOMEONE = { message: "Choose who the meeting is for" };

const saveSchema = z.object({
  title: z.string().trim().min(3, "Give the meeting a title").max(160, "Keep the title under 160 characters"),
  description: z.string().trim().max(2000, "Keep the description under 2000 characters"),
  starts_at: z.string().datetime({ offset: true, message: "Choose the date and start time" }),
  duration_min: z.number().int().min(15, "The shortest meeting is 15 minutes").max(180, "The longest meeting is 180 minutes"),
  audience,
  emails,
  cohosts: z.array(uuid).max(50),
  agenda: z.array(z.object({ title: z.string().trim().min(1, "Each agenda item needs a title").max(200), minutes: z.number().int().min(1).max(180).nullable() })).max(40),
  lobby_on: z.boolean(),
  join_muted: z.boolean(),
  join_camera_off: z.boolean().nullable(),
  screen_share_all: z.boolean(),
  chat_on: z.boolean(),
  repeat_weeks: z.number().int().min(1).max(26),
}).refine(someone, SOMEONE);

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
  if (!parsed.success) return fail([...new Set(parsed.error.issues.map((issue) => issue.message))].join(" ") || "Please check the form.");
  const { data, error } = await ctx.supabase.rpc("meeting_save", { p_id: id, p: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not save the meeting."));
  const saved = data as { id: string; invited: number; moved?: boolean };
  touched(saved.id);
  const { count } = await ctx.supabase.from("meeting_email_invites").select("id", { count: "exact", head: true }).eq("meeting_id", saved.id).is("accepted_user_id", null);
  const byEmail = count ? `, and ${count} invited by email` : "";
  return ok(id ? (saved.moved ? "Rescheduled. Everyone has been told." : "Meeting saved.") : `Meeting created. ${saved.invited} people have their pass${byEmail}.`, { redirectTo: "/admin/meetings" });
}

const instantSchema = z.object({ title: z.string().trim().min(3, "Give the meeting a title").max(160), audience, emails }).refine(someone, SOMEONE);

/** Starts now: invitees get a ring. */
export async function startInstantMeeting(input: z.input<typeof instantSchema>): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  const parsed = instantSchema.safeParse(input);
  if (!parsed.success) return fail([...new Set(parsed.error.issues.map((issue) => issue.message))].join(" ") || "Please check the form.");
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

/**
 * Ends a live meeting (or one with its doors open) for everyone without entering the room:
 * the same path as "End meeting for all" there. The database checks the host right, ends it
 * and writes the audit entry; then everyone is taken out of the call.
 */
export async function endMeeting(id: string): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("That meeting no longer exists.");
  const { data: detail } = await ctx.supabase.rpc("admin_meeting_detail", { p_meeting: id });
  const phase = (detail as { phase?: string } | null)?.phase;
  if (phase !== "live" && phase !== "doors") return fail("This meeting is not live.");
  const { error } = await ctx.supabase.rpc("meeting_host_action", { p_meeting: id, p_action: "end", p: {} });
  if (error) return fail(/FORBIDDEN/.test(error.message) ? "Only a host can end this meeting." : friendlyDbError(error.message, "Could not end the meeting."));
  if (roomConfigured()) await endRoom(id);
  touched(id);
  return ok("Meeting ended. Everyone has left the room.");
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

/** Which addresses already have a confirmed account, as the admin types them. */
export async function checkMeetingEmails(input: string[]): Promise<{ users: { email: string; user: { id: string; name: string } }[]; error?: string }> {
  const ctx = await authorize("meetings");
  if (!ctx) return { users: [], error: FORBIDDEN.message };
  const parsed = emails.safeParse(input);
  if (!parsed.success) return { users: [], error: parsed.error.issues[0]?.message };
  const { data, error } = await ctx.supabase.rpc("meeting_resolve_emails", { p_emails: parsed.data });
  if (error) return { users: [], error: "Could not check those addresses. They will still be checked when you save." };
  return { users: ((data ?? []) as { email: string; id: string; name: string }[]).map((u) => ({ email: u.email, user: { id: u.id, name: u.name } })) };
}

export async function resendMeetingEmail(id: string): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("That invite no longer exists.");
  const { error } = await ctx.supabase.rpc("meeting_email_resend", { p_id: id });
  if (error) return fail(friendlyDbError(error.message, "Could not resend it."));
  touched();
  revalidatePath("/admin/meetings/[id]", "page");
  return ok("Sent again.");
}

export async function removeMeetingEmail(id: string): Promise<ActionState> {
  const ctx = await authorize("meetings");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("That invite no longer exists.");
  const { error } = await ctx.supabase.rpc("meeting_email_remove", { p_id: id });
  if (error) return fail(friendlyDbError(error.message, "Could not remove it."));
  touched();
  revalidatePath("/admin/meetings/[id]", "page");
  return ok("Removed.");
}
