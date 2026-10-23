"use client";

import "@livekit/components-styles";
import { useEffect } from "react";
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useRoomContext, useTracks } from "@livekit/components-react";
import { RoomEvent, Track, type Participant } from "livekit-client";

export type StageMode = "candidate" | "panel" | "phone";

/** What the pages need to know about the call: who is in it, and the local camera / microphone. */
export type StageEvents = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
  /** Everyone's identity, whenever someone joins or leaves. */
  onPeople?: (identities: string[]) => void;
  onJoined?: (identity: string) => void;
  onLeft?: (identity: string) => void;
  /** The local camera or microphone was turned off. */
  onLocalOff?: (kind: "camera" | "microphone") => void;
};

function Tiles({ onlyLocal }: { onlyLocal: boolean }) {
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const tracks = onlyLocal ? all.filter((t) => t.participant.isLocal) : all;
  return (
    <GridLayout tracks={tracks} style={{ height: "calc(100% - var(--lk-control-bar-height))" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

/** Room events, passed up as plain callbacks. */
function Watcher(events: StageEvents) {
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
  return null;
}

/**
 * The video call (LiveKit), as the candidate, the panel or the phone camera
 * sees it. Chat is off for everyone; screen sharing only for the panel; the
 * phone sends its camera only, shows only itself and plays no sound (no echo
 * in the candidate's room). What each may send is also fixed by their token,
 * on the server.
 */
export function LiveKitStage({ serverUrl, token, mode, ...events }: { serverUrl: string; token: string; mode: StageMode } & StageEvents) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video
      audio={mode !== "phone"}
      data-lk-theme="default"
      style={{ height: "100%" }}
      connectOptions={mode === "phone" ? { autoSubscribe: false } : undefined}
      onConnected={events.onConnected}
      onDisconnected={events.onDisconnected}
      onError={(e) => events.onError?.(e.message)}
    >
      <Tiles onlyLocal={mode === "phone"} />
      {mode !== "phone" && <RoomAudioRenderer />}
      <ControlBar controls={{ chat: false, screenShare: mode === "panel", microphone: mode !== "phone", camera: true, leave: true, settings: false }} />
      <Watcher {...events} />
    </LiveKitRoom>
  );
}
