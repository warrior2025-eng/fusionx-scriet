"use client";

import "@livekit/components-styles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useRoomContext, useTracks } from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import {
  ConnectionQuality,
  DisconnectReason,
  MediaDeviceFailure,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
  type LocalVideoTrack,
  type Participant,
  type RoomOptions,
  type VideoCaptureOptions,
} from "livekit-client";
import { Expand, Maximize2, Minimize2, Pin, PinOff } from "lucide-react";
import { DEVICE_KEYS } from "@/lib/interview/device";
import { isPhoneIdentity } from "@/lib/interview/shared";
import { cn } from "@/lib/utils";

export type StageMode = "candidate" | "panel" | "phone";

/** Why the camera or microphone could not start (sent to the integrity timeline as a type, never any media). */
export type DeviceErrorKind = "permission_denied" | "device_in_use" | "no_device" | "other";

/** What the panel sees of each person in the call. */
export type ParticipantStatus = { mic: boolean; camera: boolean; video: boolean; quality: "good" | "poor" | "lost" | "unknown" };

/** What a page can do inside the call. */
export type StageControls = {
  /** Turn camera and microphone off and on again (fresh devices), and unblock sound. */
  fix: () => Promise<boolean>;
  /** Front ↔ back camera (phones). */
  flip: () => Promise<void>;
  /** The panel: send a short message to one person in the room. */
  send: (identity: string, message: string) => Promise<void>;
};

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
  /** The camera or microphone could not start (after one retry). */
  onDeviceError?: (kind: DeviceErrorKind, device: "camera" | "microphone") => void;
  /** Ready: the controls for this call (null when it closes). */
  onControls?: (controls: StageControls | null) => void;
  /** A message from the panel (candidates). */
  onMessage?: (message: string) => void;
  /** Camera, microphone, video and connection of everyone else (the panel), refreshed every few seconds. */
  onStatus?: (status: Record<string, ParticipantStatus>) => void;
};

function savedDevice(key: string): string | undefined {
  try {
    return sessionStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

// One room all day: small tiles get small video (adaptive stream), unused layers are not sent (dynacast),
// and each camera is sent in layers (simulcast) so a weak connection still gets a picture.
// Phones send 640×480, laptops 1280×720, both at 24 fps. Echo cancellation, noise suppression and
// automatic gain are on. Fixed objects: a new one would make a new room.
const AUDIO: AudioCaptureOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const SMALL = { width: 640, height: 480, frameRate: 24 };
const LARGE = { width: 1280, height: 720, frameRate: 24 };
const BASE = { adaptiveStream: true, dynacast: true, audioCaptureDefaults: AUDIO, publishDefaults: { simulcast: true } };
const LAPTOP_OPTIONS: RoomOptions = { ...BASE, videoCaptureDefaults: { resolution: LARGE, facingMode: "user" } };
const MOBILE_OPTIONS: RoomOptions = { ...BASE, videoCaptureDefaults: { resolution: SMALL, facingMode: "user" } };
const PHONE_CAMERA_OPTIONS: RoomOptions = { ...BASE, videoCaptureDefaults: { resolution: SMALL, facingMode: "environment" } };

const failureKind = (f?: MediaDeviceFailure): DeviceErrorKind =>
  f === MediaDeviceFailure.PermissionDenied ? "permission_denied" : f === MediaDeviceFailure.DeviceInUse ? "device_in_use" : f === MediaDeviceFailure.NotFound ? "no_device" : "other";

const errorKind = (e: unknown): DeviceErrorKind => {
  const name = e instanceof Error ? e.name : "";
  return /NotAllowed|Security/i.test(name) ? "permission_denied" : /NotReadable|TrackStart|Abort/i.test(name) ? "device_in_use" : /NotFound|Overconstrained/i.test(name) ? "no_device" : "other";
};

const qualityOf = (q: ConnectionQuality): ParticipantStatus["quality"] =>
  q === ConnectionQuality.Excellent || q === ConnectionQuality.Good ? "good" : q === ConnectionQuality.Poor ? "poor" : q === ConnectionQuality.Lost ? "lost" : "unknown";

/** One tile, with Enlarge / Unpin for the panel. */
function Tile({
  trackRef,
  pinned,
  onPin,
  className,
  children,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  pinned?: boolean;
  onPin?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const who = trackRef.participant.name || trackRef.participant.identity;
  return (
    <div className={cn("relative overflow-hidden rounded bg-black", className)}>
      <ParticipantTile trackRef={trackRef} className="h-full w-full" />
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          className="absolute right-1.5 top-1.5 z-10 rounded bg-black/60 p-1.5 text-white opacity-80 hover:opacity-100 focus-visible:opacity-100"
          aria-label={pinned ? `Back to the grid from ${who}` : `Enlarge ${who}`}
          title={pinned ? "Back to the grid" : "Enlarge"}
        >
          {pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
        </button>
      )}
      {children}
    </div>
  );
}

/**
 * `onlyLocal`: the phone, and a candidate waiting for their slot to start, see only themselves.
 * Candidates: the panel and the others large, their own camera small in a corner (no phone cameras).
 * Panel: the candidates large (16:9), each with their phone camera small in its corner; the panel
 * members in a strip above; any tile can be enlarged; the whole video can go fullscreen.
 */
function Tiles({ mode, onlyLocal }: { mode: StageMode; onlyLocal: boolean }) {
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [pinned, setPinned] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The panel grid fills its box: the number of columns that gives the largest 16:9 tiles.
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, onlyLocal]);
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement && document.fullscreenElement === box.current));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const key = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;

  if (onlyLocal || mode !== "panel") {
    const shown = onlyLocal ? all.filter((t) => t.participant.isLocal) : all.filter((t) => !isPhoneIdentity(t.participant.identity));
    const self = !onlyLocal ? shown.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) : undefined;
    const tracks = self ? shown.filter((t) => t !== self) : shown;
    const cols = Math.max(1, Math.ceil(Math.sqrt(tracks.length)));
    return (
      <div className="relative" style={{ height: "calc(100% - var(--lk-control-bar-height))" }}>
        <div className="grid h-full auto-rows-fr gap-1 overflow-y-auto p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {tracks.map((t) => (
            <Tile key={key(t)} trackRef={t} />
          ))}
        </div>
        {self && (
          <div className="absolute bottom-2 right-2 z-10 aspect-[3/4] w-24 overflow-hidden rounded border border-white/40 shadow-lg sm:w-36" aria-label="Your camera">
            <ParticipantTile trackRef={self} />
          </div>
        )}
      </div>
    );
  }

  // The panel.
  const panelTracks = all.filter((t) => t.participant.identity.startsWith("panel-") && t.source === Track.Source.Camera);
  const shares = all.filter((t) => t.source === Track.Source.ScreenShare);
  const phones = new Map(all.filter((t) => isPhoneIdentity(t.participant.identity)).map((t) => [t.participant.identity.slice(1).toLowerCase(), t]));
  const candidates = all.filter((t) => t.source === Track.Source.Camera && !t.participant.identity.startsWith("panel-") && !isPhoneIdentity(t.participant.identity));
  const phoneOf = (t: TrackReferenceOrPlaceholder) => phones.get(t.participant.identity.replace(/-/g, "").toLowerCase());
  const lonePhones = [...phones.values()].filter((p) => !candidates.some((c) => phoneOf(c) === p));
  const main = [...shares, ...candidates, ...lonePhones];
  const pin = (t: TrackReferenceOrPlaceholder) => setPinned((p) => (p === key(t) ? null : key(t)));
  const big = pinned ? [...main, ...panelTracks].find((t) => key(t) === pinned) : undefined;
  let cols = main.length <= 1 ? 1 : main.length <= 4 ? 2 : 3;
  let tileW = 0;
  if (size.w > 0 && size.h > 0 && main.length > 0) {
    for (let c = 1; c <= main.length; c++) {
      const rows = Math.ceil(main.length / c);
      const w = Math.min((size.w - (c - 1) * 4) / c, ((size.h - (rows - 1) * 4) / rows) * (16 / 9));
      if (w > tileW) {
        tileW = w;
        cols = c;
      }
    }
  }

  const candidateTile = (t: TrackReferenceOrPlaceholder, className?: string) => {
    const phone = phoneOf(t);
    return (
      <Tile key={key(t)} trackRef={t} pinned={pinned === key(t)} onPin={() => pin(t)} className={className}>
        {phone && (
          <div className="absolute bottom-9 right-1.5 z-10 aspect-[3/4] w-1/4 min-w-16 overflow-hidden rounded border border-white/50 shadow-lg" aria-label={phone.participant.name || "Phone camera"}>
            <ParticipantTile trackRef={phone} className="h-full w-full" />
          </div>
        )}
      </Tile>
    );
  };

  return (
    <div ref={box} className="relative flex flex-col bg-black" style={{ height: "calc(100% - var(--lk-control-bar-height))" }}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto p-1">
        {panelTracks.map((t) => (
          <Tile key={key(t)} trackRef={t} pinned={pinned === key(t)} onPin={() => pin(t)} className="aspect-video h-20 shrink-0 sm:h-24" />
        ))}
        <button
          type="button"
          className="ml-auto shrink-0 rounded bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={() => (full ? void document.exitFullscreen().catch(() => {}) : void box.current?.requestFullscreen().catch(() => {}))}
          aria-label={full ? "Exit fullscreen" : "Show the video fullscreen"}
          title={full ? "Exit fullscreen" : "Fullscreen"}
        >
          {full ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        </button>
      </div>
      <div ref={area} className="min-h-0 flex-1 overflow-y-auto p-1">
        {big ? (
          <div className="flex h-full flex-col gap-1">
            <div className="min-h-0 flex-1">
              {candidates.includes(big) ? candidateTile(big, "h-full") : <Tile trackRef={big} pinned onPin={() => pin(big)} className="h-full" />}
            </div>
            <div className="flex h-24 shrink-0 gap-1 overflow-x-auto">
              {main
                .filter((t) => t !== big)
                .map((t) => (
                  <Tile key={key(t)} trackRef={t} onPin={() => pin(t)} className="aspect-video h-full shrink-0" />
                ))}
            </div>
          </div>
        ) : main.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            <Expand size={16} className="mr-2" aria-hidden /> The candidates appear here when they join.
          </div>
        ) : (
          <div
            className="grid h-full content-center justify-center gap-1"
            style={{ gridTemplateColumns: tileW > 0 ? `repeat(${cols}, ${Math.floor(tileW)}px)` : `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {main.map((t) => (candidates.includes(t) ? candidateTile(t, "aspect-video") : <Tile key={key(t)} trackRef={t} onPin={() => pin(t)} className="aspect-video" />))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Room events, passed up as plain callbacks; the controls; the camera and microphone kept working. */
function Watcher({ hold, mode, ...events }: StageEvents & { hold: boolean; mode: StageMode }) {
  const room = useRoomContext();
  const { onPeople, onJoined, onLeft, onLocalOff, onReconnected, onDeviceError, onControls, onMessage, onStatus } = events;
  const facing = useRef<"user" | "environment">(mode === "phone" ? "environment" : "user");

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
    const data = (payload: Uint8Array) => {
      try {
        onMessage?.(new TextDecoder().decode(payload));
      } catch {}
    };
    // People already in the room when we connect come with no "connected" event of their own: read the list then too.
    room
      .on(RoomEvent.ParticipantConnected, joined)
      .on(RoomEvent.ParticipantDisconnected, left)
      .on(RoomEvent.TrackMuted, muted)
      .on(RoomEvent.Connected, people)
      .on(RoomEvent.Reconnected, back)
      .on(RoomEvent.DataReceived, data);
    people();
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, joined)
        .off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackMuted, muted)
        .off(RoomEvent.Connected, people)
        .off(RoomEvent.Reconnected, back)
        .off(RoomEvent.DataReceived, data);
    };
  }, [room, onPeople, onJoined, onLeft, onLocalOff, onReconnected, onMessage]);

  // The controls for the page.
  const fix = useCallback(async () => {
    const lp = room.localParticipant;
    let ok = true;
    try {
      await room.startAudio();
    } catch {}
    try {
      await lp.setCameraEnabled(false);
      await lp.setCameraEnabled(true, { facingMode: facing.current });
    } catch {
      ok = false;
    }
    if (mode !== "phone") {
      try {
        await lp.setMicrophoneEnabled(false);
        await lp.setMicrophoneEnabled(true, AUDIO);
      } catch {
        ok = false;
      }
    }
    return ok;
  }, [room, mode]);
  const flip = useCallback(async () => {
    facing.current = facing.current === "user" ? "environment" : "user";
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    try {
      if (track) await track.restartTrack({ facingMode: facing.current });
      else await room.localParticipant.setCameraEnabled(true, { facingMode: facing.current });
    } catch {}
  }, [room]);
  const send = useCallback(
    async (identity: string, message: string) => {
      await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true, destinationIdentities: [identity] });
    },
    [room],
  );
  useEffect(() => {
    onControls?.({ fix, flip, send });
    return () => onControls?.(null);
  }, [onControls, fix, flip, send]);

  // Camera and microphone: shortly after connecting (and when the slot starts), check they are on; if not, try again
  // (an Android camera released by the device check a moment before can still be busy). Only after the second try
  // is it reported. A camera or microphone that stops (unplugged, taken by another app) is started again.
  const held = useRef(hold);
  useEffect(() => {
    if (hold) {
      held.current = true;
      return;
    }
    const wasHeld = held.current;
    held.current = false;
    let stop = false;
    const lp = room.localParticipant;
    const kinds = mode === "phone" ? (["camera"] as const) : (["camera", "microphone"] as const);
    const ensure = async (last: boolean) => {
      if (stop || room.state !== "connected") return;
      for (const kind of kinds) {
        if (kind === "camera" ? lp.isCameraEnabled : lp.isMicrophoneEnabled) continue;
        // Turned off on purpose (muted) is not a failure.
        if (lp.getTrackPublication(kind === "camera" ? Track.Source.Camera : Track.Source.Microphone)?.isMuted) continue;
        try {
          if (kind === "camera") await lp.setCameraEnabled(true, { facingMode: facing.current, deviceId: mode === "phone" ? undefined : savedDevice(DEVICE_KEYS.camera) });
          else await lp.setMicrophoneEnabled(true, { ...AUDIO, deviceId: savedDevice(DEVICE_KEYS.microphone) });
        } catch (e) {
          if (last) onDeviceError?.(errorKind(e), kind);
        }
      }
    };
    const first = window.setTimeout(() => void ensure(false).then(() => window.setTimeout(() => void ensure(true), 2500)), wasHeld ? 300 : 3500);
    const revive = () => {
      const cam = lp.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
      if (cam && cam.mediaStreamTrack?.readyState === "ended") void cam.restartTrack({ facingMode: facing.current }).catch(() => {});
      const mic = lp.getTrackPublication(Track.Source.Microphone)?.track;
      if (mic && mic.mediaStreamTrack?.readyState === "ended") void lp.setMicrophoneEnabled(false).then(() => lp.setMicrophoneEnabled(true, AUDIO)).catch(() => {});
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", revive);
    const watch = window.setInterval(revive, 5000);
    return () => {
      stop = true;
      window.clearTimeout(first);
      window.clearInterval(watch);
      navigator.mediaDevices?.removeEventListener?.("devicechange", revive);
    };
  }, [room, hold, mode, onDeviceError]);

  // The speaker picked on the device check (where the browser can choose one).
  useEffect(() => {
    const out = savedDevice(DEVICE_KEYS.speaker);
    if (!out || mode === "phone") return;
    const apply = () => void room.switchActiveDevice("audiooutput", out).catch(() => {});
    room.on(RoomEvent.Connected, apply);
    return () => {
      room.off(RoomEvent.Connected, apply);
    };
  }, [room, mode]);

  // The panel: everyone's camera, microphone, video and connection.
  useEffect(() => {
    if (!onStatus) return;
    const report = () => {
      const out: Record<string, ParticipantStatus> = {};
      for (const p of room.remoteParticipants.values()) {
        const cam = p.getTrackPublication(Track.Source.Camera);
        out[p.identity] = {
          mic: p.isMicrophoneEnabled,
          camera: p.isCameraEnabled,
          video: Boolean(cam && !cam.isMuted && cam.isSubscribed && cam.track),
          quality: qualityOf(p.connectionQuality),
        };
      }
      onStatus(out);
    };
    const kinds = [
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.ConnectionQualityChanged,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ] as const;
    for (const k of kinds) room.on(k, report);
    report();
    const timer = window.setInterval(report, 4000);
    return () => {
      for (const k of kinds) room.off(k, report);
      window.clearInterval(timer);
    };
  }, [room, onStatus]);
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
 * `small`: a phone or tablet (640×480 camera). Where the browser blocks sound
 * until a tap (iPhone, some Android), a "Tap to enable sound" button shows.
 */
export function LiveKitStage({
  serverUrl,
  token,
  mode,
  hold = false,
  small = false,
  ...events
}: { serverUrl: string; token: string; mode: StageMode; hold?: boolean; small?: boolean } & StageEvents) {
  const quiet = mode === "phone" || hold;
  const { onConnected, onDisconnected, onError, onDeviceError } = events;
  // Stable props: LiveKitRoom binds its listeners again whenever these change.
  const video = useMemo<VideoCaptureOptions | boolean>(() => {
    const id = mode === "phone" ? undefined : savedDevice(DEVICE_KEYS.camera);
    return id ? { deviceId: id } : true;
  }, [mode]);
  const audio = useMemo<AudioCaptureOptions | boolean>(() => {
    const id = savedDevice(DEVICE_KEYS.microphone);
    return id ? { ...AUDIO, deviceId: id } : true;
  }, []);
  const handleDisconnected = useCallback((reason?: DisconnectReason) => onDisconnected?.(reason === DisconnectReason.PARTICIPANT_REMOVED), [onDisconnected]);
  const handleError = useCallback((e: Error) => onError?.(e.message), [onError]);
  const handleDevice = useCallback(
    (f?: MediaDeviceFailure, kind?: MediaDeviceKind) => onDeviceError?.(failureKind(f), kind === "audioinput" ? "microphone" : "camera"),
    [onDeviceError],
  );
  const handleConnected = useCallback(() => onConnected?.(), [onConnected]);
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video={hold ? false : video}
      audio={mode !== "phone" && !hold ? audio : false}
      options={mode === "phone" ? PHONE_CAMERA_OPTIONS : small ? MOBILE_OPTIONS : LAPTOP_OPTIONS}
      data-lk-theme="default"
      style={{ height: "100%", position: "relative" }}
      connectOptions={mode === "phone" ? { autoSubscribe: false } : undefined}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
      onMediaDeviceFailure={handleDevice}
    >
      <Tiles mode={mode} onlyLocal={quiet} />
      {!quiet && <RoomAudioRenderer />}
      {!quiet && (
        <StartAudio
          label="Tap to enable sound"
          className="absolute! left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded! bg-[#004df6]! px-6! py-4! text-base! font-semibold! text-white! shadow-xl"
        />
      )}
      <ControlBar controls={{ chat: false, screenShare: mode === "panel", microphone: mode !== "phone", camera: true, leave: true, settings: false }} />
      <Watcher hold={hold} mode={mode} {...events} />
    </LiveKitRoom>
  );
}
