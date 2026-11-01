import { roomConfigured } from "@/lib/interview/livekit";
import { meetingToken } from "@/lib/meetings/livekit";
import { createClient } from "@/lib/supabase/server";

type Enter = { ok: boolean; reason?: string; is_host?: boolean; user_id?: string; name?: string; join_muted?: boolean; join_camera_off?: boolean; can_share?: boolean };

/**
 * A LiveKit token for this meeting. Every request is checked by the database as the
 * signed-in person (meeting_enter): invited or let in, not ended or locked, inside the
 * join window. Nothing here can be asked for by someone who is not signed in.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, reason: "not_found" }, { status: 404, headers });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, reason: "sign_in" }, { status: 401, headers });
  if (!roomConfigured()) return Response.json({ ok: false, reason: "no_room" }, { status: 503, headers });

  const { data, error } = await supabase.rpc("meeting_enter", { p_meeting: id });
  if (error || !data) return Response.json({ ok: false, reason: "not_found" }, { status: 500, headers });
  const enter = data as Enter;
  if (!enter.ok || !enter.user_id) {
    // In the lobby is not a refusal: the page waits and asks again.
    return Response.json({ ok: false, reason: enter.reason }, { status: enter.reason === "lobby" ? 202 : 403, headers });
  }
  const { serverUrl, token } = meetingToken({
    meetingId: id,
    userId: enter.user_id,
    name: enter.name ?? "Member",
    canShare: Boolean(enter.can_share),
    isHost: Boolean(enter.is_host),
  });
  return Response.json(
    { ok: true, serverUrl, token, isHost: enter.is_host, userId: enter.user_id, name: enter.name, joinMuted: enter.join_muted, joinCameraOff: enter.join_camera_off },
    { headers },
  );
}
