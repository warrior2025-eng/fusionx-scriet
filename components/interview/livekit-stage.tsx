"use client";

import "@livekit/components-styles";
import { useEffect, useRef } from "react";
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useRoomContext, useTracks } from "@livekit/components-react";
import { DisconnectReason, RoomEvent, Track, VideoPresets, type Participant, type RoomOptions } from "livekit-client";
import { isPhoneIdentity } from "@/lib/interview/shared";

export type StageMode = "candidate" | "panel" | "phone";

/** What the pages need to know about the call: who is in it, and the local camera / microphone. */
export type StageEvents = {
  onConnected?: () => void;
  /** `removed`: the server took this person out of the room (their slot was over). */
  onDisconnected?: (removed: boolean) => void;
  onError?: (message: string) => void;
  /** Everyone's identity, whenever someone joins or leaves. */
  onPeople?: (identities: string[]) => void;
  onJoined?: (identity: string) => void;
  onLeft?: (identity: string) => void;
  /** The local camera or microphone was turned off. */
  onLocalOff?: (kind: "camera" | "microphone") => void;
};

// One room all day: small tiles get small video (adaptive stream), unused layers are not sent (dynacast).
// Keeps the free plan's data transfer low. Fixed object: a new one would make a new room.
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
};

/** `onlyLocal`: the phone, and a candidate waiting for their slot to start, see only themselves. */
function Tiles({ onlyLocal, hidePhones }: { onlyLocal: boolean; hidePhones: boolean }) {
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const tracks = onlyLocal ? all.filter((t) => t.participant.isLocal) : hidePhones ? all.filter((t) => !isPhoneIdentity(t.participant.identity)) : all;
  return (
    <GridLayout tracks={tracks} style={{ height: "calc(100% - var(--lk-control-bar-height))" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

/** Room events, passed up as plain callbacks. */
function Watcher({ hold, ...events }: StageEvents & { hold: boolean }) {
  const room = useRoomContext();
  const { onPeople, onJoined, onLeft, onLocalOff } = events;
  useEffect(() => {
    const people = () => onPeople?.([room.localParticipant.identity, ...[...room.remoteParticipants.values()].map((p) => p.identity)]);
    const joined = (p: Participant) => {
      onJoined?.(p.identity);
      people();
    };
    const left = (p: Participant) => {
      onLeft?.(p.identity);
      people();
    };
    const muted = (pub: { source?: Track.Source }, p: Participant) => {
      if (!p.isLocal) return;
      if (pub.source === Track.Source.Camera) onLocalOff?.("camera");
      if (pub.source === Track.Source.Microphone) onLocalOff?.("microphone");
    };
    // People already in the room when we connect come with no "connected" event of their own: read the list then too.
    room
      .on(RoomEvent.ParticipantConnected, joined)
      .on(RoomEvent.ParticipantDisconnected, left)
      .on(RoomEvent.TrackMuted, muted)
      .on(RoomEvent.Connected, people)
      .on(RoomEvent.Reconnected, people);
    people();
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, joined)
        .off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackMuted, muted)
        .off(RoomEvent.Connected, people)
        .off(RoomEvent.Reconnected, people);
    };
  }, [room, onPeople, onJoined, onLeft, onLocalOff]);

  // A candidate let in before their slot starts waits with camera and microphone off; at the start both turn on.
  const held = useRef(hold);
  useEffect(() => {
    if (hold) {
      held.current = true;
      return;
    }
    if (!held.current) return;
    held.current = false;
    const on = () => {
      if (!room.localParticipant.isCameraEnabled) void room.localParticipant.setCameraEnabled(true).catch(() => {});
      if (!room.localParticipant.isMicrophoneEnabled) void room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
    };
    if (room.state === "connected") on();
    room.on(RoomEvent.Connected, on);
    return () => {
      room.off(RoomEvent.Connected, on);
    };
  }, [room, hold]);
  return null;
}

/**
 * The video call (LiveKit), as the candidate, the panel or the phone camera
 * sees it. Chat is off for everyone; screen sharing only for the panel; the
 * phone sends its camera only, shows only itself and plays no sound (no echo
 * in the candidate's room). Candidates do not see phone cameras. What each may
 * send is also fixed by their token, on the server.
 *
 * `hold` (candidates, when early join is on): connected before the slot
 * starts, with camera and microphone off, seeing and hearing nobody.
 */
export function LiveKitStage({
  serverUrl,
  token,
  mode,
  hold = false,
  ...events
}: { serverUrl: string; token: string; mode: StageMode; hold?: boolean } & StageEvents) {
  const quiet = mode === "phone" || hold;
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video={!hold}
      audio={mode !== "phone" && !hold}
      options={ROOM_OPTIONS}
      data-lk-theme="default"
      style={{ height: "100%" }}
      connectOptions={mode === "phone" ? { autoSubscribe: false } : undefined}
      onConnected={events.onConnected}
      onDisconnected={(reason) => events.onDisconnected?.(reason === DisconnectReason.PARTICIPANT_REMOVED)}
      onError={(e) => events.onError?.(e.message)}
    >
      <Tiles onlyLocal={quiet} hidePhones={mode === "candidate"} />
      {!quiet && <RoomAudioRenderer />}
      <ControlBar controls={{ chat: false, screenShare: mode === "panel", microphone: mode !== "phone", camera: true, leave: true, settings: false }} />
      <Watcher hold={hold} {...events} />
    </LiveKitRoom>
  );
}
