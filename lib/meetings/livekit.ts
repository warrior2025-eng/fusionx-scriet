import { keys, roomService, sign } from "@/lib/interview/livekit";

/**
 * LiveKit for Meetings: SERVER ONLY, like lib/interview/livekit.ts, whose signing
 * and server API it reuses. Its own rooms ("fx-meet-<meeting id>") and its own
 * token kind ("meeting"); the interview room's tokens and rooms are untouched.
 *
 * The identity is the person's user id, so one person has one seat: connecting
 * again (another tab, the phone) makes LiveKit disconnect the earlier connection.
 *
 * The token lasts 5 minutes: enough to connect. A connected browser is sent fresh
 * ones by LiveKit, and a token kept by someone removed soon stops working.
 */

const TOKEN_MINUTES = 5;

export const meetingRoomName = (meetingId: string) => `fx-meet-${meetingId}`;

/** What someone may send. Screen share can be for hosts only; the rest is the same for everyone. */
function sources(canShare: boolean) {
  return canShare ? ["camera", "microphone", "screen_share", "screen_share_audio"] : ["camera", "microphone"];
}

export function meetingToken(input: { meetingId: string; userId: string; name: string; canShare: boolean; isHost: boolean }): { serverUrl: string; token: string } {
  const { url, key, secret } = keys();
  const now = Math.floor(Date.now() / 1000);
  return {
    serverUrl: url,
    token: sign(
      {
        iss: key,
        sub: input.userId,
        jti: `${input.userId}-${now}`,
        name: input.name.slice(0, 80),
        nbf: now - 10,
        exp: now + TOKEN_MINUTES * 60,
        metadata: JSON.stringify({ kind: "meeting", host: input.isHost }),
        video: {
          room: meetingRoomName(input.meetingId),
          roomJoin: true,
          canSubscribe: true,
          canPublish: true,
          canPublishData: true,
          canPublishSources: sources(input.canShare),
          canUpdateOwnMetadata: false,
          // Never a room admin: every host action goes through this server, which checks first.
          roomAdmin: false,
        },
      },
      secret,
    ),
  };
}

type RemoteTrack = { sid: string; type?: string | number; source?: string | number; muted?: boolean };
type RemoteParticipant = { identity: string; tracks?: RemoteTrack[] };

async function participants(meetingId: string): Promise<RemoteParticipant[]> {
  const data = await roomService<{ participants?: RemoteParticipant[] }>("ListParticipants", meetingRoomName(meetingId), {});
  return data?.participants ?? [];
}

const isSource = (t: RemoteTrack, name: "MICROPHONE" | "CAMERA", number: number) => t.source === name || t.source === number;

/** Mutes the given kind of track on everyone but `except`. A person can turn theirs on again. */
export async function muteTracks(meetingId: string, kind: "mic" | "camera", only?: string, except?: string): Promise<void> {
  const room = meetingRoomName(meetingId);
  const people = (await participants(meetingId)).filter((p) => (only ? p.identity === only : p.identity !== except));
  await Promise.all(
    people.flatMap((p) =>
      (p.tracks ?? [])
        .filter((t) => !t.muted && (kind === "mic" ? isSource(t, "MICROPHONE", 2) : isSource(t, "CAMERA", 1)))
        .map((t) => roomService("MutePublishedTrack", room, { identity: p.identity, track_sid: t.sid, muted: true }).catch(() => null)),
    ),
  );
}

/** Applies a host change to someone in the room at once: what they may send, without rejoining. */
export async function updatePermissions(meetingId: string, userId: string, isHost: boolean, canShare: boolean): Promise<void> {
  await roomService("UpdateParticipant", meetingRoomName(meetingId), {
    identity: userId,
    metadata: JSON.stringify({ kind: "meeting", host: isHost }),
    permission: { can_subscribe: true, can_publish: true, can_publish_data: true, can_publish_sources: sources(canShare).map((s) => s.toUpperCase()) },
  }).catch(() => null); // they may not be connected at this moment; the next token carries the same rights
}

export async function removeFromRoom(meetingId: string, userId: string): Promise<void> {
  await roomService("RemoveParticipant", meetingRoomName(meetingId), { identity: userId }).catch(() => null);
}

/** Disconnects everyone. */
export async function closeRoom(meetingId: string): Promise<void> {
  await roomService("DeleteRoom", meetingRoomName(meetingId), {}).catch(() => null);
}

/** Ending for everyone, from the room or the admin panel: browsers read the end, then the call closes. */
export async function endRoom(meetingId: string): Promise<void> {
  await nudgeRoom(meetingId);
  await closeRoom(meetingId);
}

/** Whether anyone is connected to the call. When LiveKit can't be asked, assume so: nothing is ended on a guess. */
export async function roomHasPeople(meetingId: string): Promise<boolean> {
  try {
    return (await participants(meetingId)).length > 0;
  } catch {
    return true;
  }
}

/** Tells every browser in the room to read the state now rather than at its next check. */
export async function nudgeRoom(meetingId: string): Promise<void> {
  await roomService("SendData", meetingRoomName(meetingId), {
    data: Buffer.from(JSON.stringify({ t: "sync" })).toString("base64"),
    kind: "RELIABLE",
    topic: "meeting",
  }).catch(() => null);
}
