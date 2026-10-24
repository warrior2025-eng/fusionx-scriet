"use client";

import "@livekit/components-styles";
import { useEffect, useRef } from "react";
import { ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, TrackLoop, useRoomContext, useTracks } from "@livekit/components-react";
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
  /** Back after a network drop (the call reconnected by itself). */
  onReconnected?: () => void;
};

// One room all day: small tiles get small video (adaptive stream), unused layers are not sent (dynacast).
// Keeps the free plan's data transfer low. Fixed objects: a new one would make a new room.
// The front camera for people, the back camera for the phone that shows the desk.
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h540.resolution, facingMode: "user" },
};
const PHONE_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h540.resolution, facingMode: "environment" },
};

/**
 * `onlyLocal`: the phone, and a candidate waiting for their slot to start, see only themselves.
 * `pip` (candidates): the panel and the others large, their own camera small in a corner.
 */
function Tiles({ onlyLocal, hidePhones, pip }: { onlyLocal: boolean; hidePhones: boolean; pip: boolean }) {
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const shown = onlyLocal ? all.filter((t) => t.participant.isLocal) : hidePhones ? all.filter((t) => !isPhoneIdentity(t.participant.identity)) : all;
  const self = pip && !onlyLocal ? shown.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) : undefined;
  const tracks = self ? shown.filter((t) => t !== self) : shown;
  // Everyone on one screen (no pages): the panel sees the whole slot at once.
  const cols = Math.max(1, Math.ceil(Math.sqrt(tracks.length)));
  return (
    <div className="relative" style={{ height: "calc(100% - var(--lk-control-bar-height))" }}>
      <div className="grid h-full auto-rows-fr gap-1 overflow-y-auto p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        <TrackLoop tracks={tracks}>
          <ParticipantTile />
        </TrackLoop>
      </div>
      {self && (
        <div className="absolute bottom-2 right-2 z-10 aspect-[3/4] w-24 overflow-hidden rounded border border-white/40 shadow-lg sm:w-36" aria-label="Your camera">
          <ParticipantTile trackRef={self} />
        </div>
      )}
    </div>
  );
}

/** Room events, passed up as plain callbacks. */
function Watcher({ hold, ...events }: StageEvents & { hold: boolean }) {
  const room = useRoomContext();
  const { onPeople, onJoined, onLeft, onLocalOff, onReconnected } = events;
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
    const back = () => {
      people();
      onReconnected?.();
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
      .on(RoomEvent.Reconnected, back);
    people();
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, joined)
        .off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackMuted, muted)
        .off(RoomEvent.Connected, people)
        .off(RoomEvent.Reconnected, back);
    };
  }, [room, onPeople, onJoined, onLeft, onLocalOff, onReconnected]);

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
      options={mode === "phone" ? PHONE_OPTIONS : ROOM_OPTIONS}
      data-lk-theme="default"
      style={{ height: "100%" }}
      connectOptions={mode === "phone" ? { autoSubscribe: false } : undefined}
      onConnected={events.onConnected}
      onDisconnected={(reason) => events.onDisconnected?.(reason === DisconnectReason.PARTICIPANT_REMOVED)}
      onError={(e) => events.onError?.(e.message)}
    >
      <Tiles onlyLocal={quiet} hidePhones={mode === "candidate"} pip={mode === "candidate"} />
      {!quiet && <RoomAudioRenderer />}
      <ControlBar controls={{ chat: false, screenShare: mode === "panel", microphone: mode !== "phone", camera: true, leave: true, settings: false }} />
      <Watcher hold={hold} {...events} />
    </LiveKitRoom>
  );
}
