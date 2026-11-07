import { z } from "zod";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { roomConfigured } from "@/lib/interview/livekit";
import { endRoom, muteTracks, nudgeRoom, removeFromRoom, updatePermissions } from "@/lib/meetings/livekit";
import { friendlyDbError } from "@/lib/recruitment/shared";
import { createClient } from "@/lib/supabase/server";

const ACTIONS = [
  "set_notes", "action_add", "action_delete", "send_minutes", "make_cohost", "remove_cohost", "admit", "admit_all", "deny", "knock_let_in", "knock_not_now",
  "ring", "lower_hand", "lower_hands", "lock", "agenda", "chat_delete", "mute_all", "cameras_off", "mute_person", "remove_person", "end",
  "invite_search", "invite",
] as const;

const bodySchema = z.object({
  action: z.enum(ACTIONS),
  args: z
    .object({
      user: z.string().uuid().optional(),
      id: z.string().uuid().nullable().optional(),
      locked: z.boolean().optional(),
      body: z.string().max(50000).optional(),
      decisions: z.array(z.string().max(500)).max(100).optional(),
      task: z.string().max(300).optional(),
      due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
      q: z.string().max(100).optional(),
      users: z.array(z.string().uuid()).max(50).optional(),
      emails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(50).optional(),
      ring: z.boolean().optional(),
    })
    .default({}),
});

type Answer = { live?: "permissions" | "mute_all" | "cameras_off" | "mute_person" | "remove" | "end"; user?: string; host?: boolean; screen_share_all?: boolean };

/**
 * Every host action in a meeting. The database decides first, as the signed-in person
 * (meeting_host_action: rights checked, change made, audit entry written). What LiveKit
 * has to do happens only after that, with the server's key: browsers never hold room
 * admin rights.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That request was not understood." }, { status: 400 });
  const { action, args } = parsed.data;

  // Inviting from the room: the database checks the host right, the hourly limit and the
  // email rules, and writes the passes, notifications, rings and the audit entry.
  if (action === "invite_search" || action === "invite") {
    const { data, error } =
      action === "invite_search"
        ? await supabase.rpc("meeting_invite_search", { p_meeting: id, p_q: args.q ?? "" })
        : await supabase.rpc("meeting_invite_live", { p_meeting: id, p_users: args.users ?? [], p_emails: args.emails ?? [], p_ring: args.ring ?? true });
    if (error) {
      const forbidden = /FORBIDDEN/.test(error.message);
      return Response.json({ error: forbidden ? "Only a host can do this." : friendlyDbError(error.message, "That could not be done.") }, { status: forbidden ? 403 : 400 });
    }
    if (action === "invite") {
      if (roomConfigured()) await nudgeRoom(id);
      deliverEmailsAfterResponse();
    }
    return Response.json(action === "invite_search" ? { results: data ?? [] } : data, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabase.rpc("meeting_host_action", { p_meeting: id, p_action: action, p: args });
  if (error) {
    const forbidden = /FORBIDDEN/.test(error.message);
    return Response.json({ error: forbidden ? "Only a host can do this." : friendlyDbError(error.message, "That could not be done.") }, { status: forbidden ? 403 : 400 });
  }
  const answer = (data ?? {}) as Answer;

  if (roomConfigured()) {
    if (answer.live === "permissions" && answer.user) {
      await updatePermissions(id, answer.user, Boolean(answer.host), Boolean(answer.host) || answer.screen_share_all !== false);
    } else if (answer.live === "mute_all") {
      await muteTracks(id, "mic", undefined, user.id);
    } else if (answer.live === "cameras_off") {
      await muteTracks(id, "camera", undefined, user.id);
    } else if (answer.live === "mute_person" && answer.user) {
      await muteTracks(id, "mic", answer.user);
    } else if (answer.live === "remove" && answer.user) {
      await removeFromRoom(id, answer.user);
    } else if (answer.live === "end") {
      await endRoom(id);
    }
    if (answer.live !== "end" && action !== "set_notes") await nudgeRoom(id);
  }
  if (action === "send_minutes") deliverEmailsAfterResponse();
  return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
}
