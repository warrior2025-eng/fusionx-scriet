"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  isTrackReference,
  useConnectionQualityIndicator,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionQuality, ConnectionState, DisconnectReason, RoomEvent, Track, type AudioCaptureOptions, type Participant, type RoomOptions, type VideoCaptureOptions } from "livekit-client";
import {
  AudioLines,
  Bell,
  BellOff,
  Hand,
  LayoutGrid,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PanelRight,
  Pin,
  PinOff,
  RefreshCw,
  Rows3,
  ShieldCheck,
  Smartphone,
  Smile,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEVICE_KEYS } from "@/lib/interview/device";
import { createClient } from "@/lib/supabase/client";
import { hostBadge, type Entered, type RoomPerson, type RoomState } from "@/lib/meetings/shared";
import { cn } from "@/lib/utils";
import type { LeaveReason } from "./enter-flow";
import { QrPanel } from "./qr-panel";
import { Avatar, Badge, PersonMenu, RoomSidebar, type LiveInfo, type RoomApi, type Tab } from "./room-sidebar";
import { useRoomState } from "./use-room-state";

const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉"];
// Floating reactions take the first free lane, so several at once never overlap.
const LANES = [8, 22, 36, 50, 64, 78];
const FLOAT_MS = 3000;
type Float = { id: number; emoji: string; ids: string[]; names: string[]; lane: number; first: number };

/** "Riya", "Riya, Aman", "Riya, Aman +3". */
const reactors = (names: string[]) => (names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`);
const quietMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let nextId = 0;
const AUDIO: AudioCaptureOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
// Small and off-screen tiles get low quality (adaptive stream, simulcast), and layers nobody watches are not sent.
const BASE: RoomOptions = { adaptiveStream: true, dynacast: true, audioCaptureDefaults: AUDIO, publishDefaults: { simulcast: true } };
const LAPTOP: RoomOptions = { ...BASE, videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 24 }, facingMode: "user" } };
const PHONE: RoomOptions = { ...BASE, videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 }, facingMode: "user" } };

const saved = (key: string) => {
  try {
    return sessionStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
};

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    const first = window.setTimeout(update, 0);
    query.addEventListener("change", update);
    return () => {
      window.clearTimeout(first);
      query.removeEventListener("change", update);
    };
  }, []);
  return phone;
}

/** A short soft sound. Silent where the browser has not allowed sound yet. */
function tone(notes: number[]) {
  try {
    const ctx = new AudioContext();
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.14;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.06, at + 0.02);
      gain.gain.linearRampToValueAtTime(0, at + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.15);
    });
    window.setTimeout(() => void ctx.close().catch(() => {}), notes.length * 200 + 300);
  } catch {}
}

/**
 * Speaking, held on for half a second after they stop, so the highlight does not
 * flicker between words.
 */
function useSpeakingHeld(p: Participant): boolean {
  const speaking = useIsSpeaking(p);
  const [was, setWas] = useState(speaking);
  const [stops, setStops] = useState(0);
  const [quiet, setQuiet] = useState(0);
  if (was !== speaking) {
    setWas(speaking);
    if (!speaking) setStops(stops + 1);
  }
  useEffect(() => {
    if (stops === quiet) return;
    const timer = window.setTimeout(() => setQuiet(stops), 500);
    return () => window.clearTimeout(timer);
  }, [stops, quiet]);
  return speaking || stops !== quiet;
}

/** The size of an element, kept up to date as it changes. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, box] as const;
}

/**
 * Everyone on one screen: the column count that gives the biggest 16:9 picture for n
 * people in w×h (2 side by side, 4 as 2×2, 9 as 3×3, 25 as 5×5 on a wide screen). Each
 * tile then fills its cell.
 */
function fitGallery(n: number, w: number, h: number, gap = 4) {
  let best = { cols: 1, rows: 1, cellW: w, cellH: h, score: -1 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (w - gap * (cols - 1)) / cols;
    const cellH = (h - gap * (rows - 1)) / rows;
    const score = Math.min(cellW, (cellH * 16) / 9);
    if (score > best.score) best = { cols, rows, cellW, cellH, score };
  }
  return best;
}

function Tile({ trackRef, person, api, pinned, onPin, small, fit, reaction }: { trackRef: TrackReferenceOrPlaceholder; person?: RoomPerson; api: RoomApi | null; pinned: boolean; onPin: () => void; small?: boolean; fit?: boolean; reaction?: string }) {
  const p = trackRef.participant;
  const speakingNow = useSpeakingHeld(p);
  const muted = useIsMuted(trackRef);
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const [menu, setMenu] = useState(false);
  const isShare = trackRef.source === Track.Source.ScreenShare;
  const showVideo = isTrackReference(trackRef) && !muted;
  const name = person?.name ?? p.name ?? "Member";
  const badge = person ? hostBadge(person.host_kind) : null;
  const canManage = api?.state.me.is_host && person && !p.isLocal;
  const speaking = speakingNow && !isShare;
  return (
    <div
      className={cn("meeting-tile-in group relative h-full w-full overflow-hidden rounded bg-[#0a1230]", speaking ? "meeting-speaking" : "ring-1 ring-white/10")}
      data-tile={name}
      data-speaking={speaking ? "" : undefined}
      data-source={trackRef.source}
      data-video={showVideo ? "on" : "off"}
    >
      {showVideo ? (
        <VideoTrack trackRef={trackRef} className={cn("h-full w-full", fit || isShare ? "object-contain" : "object-cover", p.isLocal && !isShare && "-scale-x-100")} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar person={{ name, avatar_url: person?.avatar_url ?? null }} className={cn(small ? "h-10 w-10 text-xs" : "h-20 w-20 text-xl", speaking && "meeting-speaking-avatar")} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5 pt-6 text-white">
        <div className="min-w-0 flex-1 text-xs leading-tight">
          <p className={cn("flex max-w-full items-center gap-1 truncate font-semibold", speaking && "meeting-speaking-name")}>
            {micMuted && !isShare && <MicOff size={12} aria-label="Muted" className="shrink-0" />}
            {speaking && <AudioLines size={12} aria-label="Speaking" className="shrink-0" />}
            <span className="truncate">{isShare ? `${name}'s screen` : p.isLocal ? `${name} (you)` : name}</span>
          </p>
          {!small && !isShare && person && <p className="truncate text-white/80" title={person.seat.label}>{person.seat.short}</p>}
        </div>
        {badge && !isShare && <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-semibold">{badge}</span>}
      </div>
      {!isShare && (person?.hand || reaction) && (
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
          {person?.hand && (
            <span className="rounded-sm bg-amber-400 p-1 text-black" title="Hand raised">
              <Hand size={13} aria-label="Hand raised" />
            </span>
          )}
          {reaction && (
            <span className="rounded-full bg-black/70 px-1.5 py-0.5 text-base leading-none" data-tile-reaction={reaction} aria-hidden>
              {reaction}
            </span>
          )}
        </div>
      )}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <button type="button" onClick={onPin} aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`} className="rounded bg-black/60 p-1 text-white">
          {pinned ? <PinOff size={13} aria-hidden /> : <Pin size={13} aria-hidden />}
        </button>
        {canManage && (
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label={`More for ${name}`} aria-expanded={menu} className="rounded bg-black/60 p-1 text-white">
            <MoreHorizontal size={13} aria-hidden />
          </button>
        )}
      </div>
      {menu && canManage && api && person && <PersonMenu person={person} api={api} onDone={() => setMenu(false)} className="absolute right-1.5 top-9 z-20" />}
    </div>
  );
}

function Stage({ state, api, view, phone, reactions }: { state: RoomState | null; api: RoomApi | null; view: "gallery" | "speaker"; phone: boolean; reactions: Record<string, string> }) {
  const all = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const speaking = useSpeakingParticipants();
  const [pinned, setPinned] = useState<string | null>(null);
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [galleryRef, box] = useBox<HTMLDivElement>();
  // Tiles keep their place: everyone stays in the order they first appeared.
  const [seen, setSeen] = useState<string[]>([]);
  const loudest = speaking.find((p) => !p.isLocal)?.identity ?? null;
  if (loudest && loudest !== lastSpeaker) setLastSpeaker(loudest);

  const people = useMemo(() => new Map((state?.people ?? []).map((p) => [p.id, p])), [state?.people]);
  const key = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;
  const unseen = all.filter((t) => t.source === Track.Source.Camera && !seen.includes(t.participant.identity)).map((t) => t.participant.identity);
  if (unseen.length > 0) setSeen([...seen, ...unseen]);
  const place = (t: TrackReferenceOrPlaceholder) => {
    const at = seen.indexOf(t.participant.identity);
    return at < 0 ? seen.length : at;
  };
  const cams = all.filter((t) => t.source === Track.Source.Camera).sort((a, b) => place(a) - place(b));
  const shares = all.filter((t) => t.source === Track.Source.ScreenShare);
  const tile = (t: TrackReferenceOrPlaceholder, opts: { small?: boolean; fit?: boolean } = {}) => (
    <Tile
      key={key(t)}
      trackRef={t}
      person={people.get(t.participant.identity)}
      api={api}
      pinned={pinned === key(t)}
      onPin={() => setPinned((v) => (v === key(t) ? null : key(t)))}
      reaction={t.source === Track.Source.Camera ? reactions[t.participant.identity] : undefined}
      {...opts}
    />
  );

  const pinnedTrack = pinned ? all.find((t) => key(t) === pinned) : undefined;
  const speakerMode = view === "speaker" && !phone;
  const main =
    pinnedTrack ??
    shares[0] ??
    (speakerMode ? (cams.find((t) => t.participant.identity === lastSpeaker) ?? cams.find((t) => !t.participant.isLocal) ?? cams[0]) : undefined);

  if (main) {
    const self = cams.find((t) => t.participant.isLocal);
    const strip = [...shares, ...cams].filter((t) => t !== main && !(speakerMode && t === self && main !== self));
    return (
      <div className="flex h-full min-h-0 flex-col gap-1 p-1" data-layout={shares[0] && main === shares[0] ? "share" : "speaker"}>
        <div className="relative min-h-0 flex-1">
          {tile(main, { fit: main.source === Track.Source.ScreenShare })}
          {speakerMode && self && main !== self && <div className="absolute bottom-2 right-2 z-10 aspect-video w-28 shadow-lg sm:w-40" aria-label="Your camera">{tile(self, { small: true })}</div>}
        </div>
        {strip.length > 0 && (
          <div className="flex h-20 shrink-0 gap-1 overflow-x-auto sm:h-24">
            {strip.map((t) => (
              <div key={key(t)} className="aspect-video h-full shrink-0">
                {tile(t, { small: true })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phone) {
    // A compact grid of everyone, scrolling inside the video area when it has to.
    const cols = cams.length <= 4 ? 2 : cams.length <= 12 ? 3 : 4;
    return (
      <div className="h-full overflow-y-auto p-1" data-layout="gallery" data-cols={cols}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cams.map((t) => (
            <div key={key(t)} className="aspect-[3/4]">
              {tile(t, { small: cols > 2 })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const grid = fitGallery(cams.length, Math.max(0, box.w - 8), Math.max(0, box.h - 8));
  return (
    <div ref={galleryRef} className="h-full overflow-hidden p-1" data-layout="gallery" data-cols={grid.cols}>
      <div className="flex h-full flex-wrap content-center justify-center gap-1">
        {box.w > 0 &&
          cams.map((t) => (
            <div key={key(t)} style={{ width: grid.cellW, height: grid.cellH }}>
              {tile(t, { small: grid.cellW < 220 })}
            </div>
          ))}
      </div>
    </div>
  );
}

function Ctrl({ label, on, danger, onClick, children, disabled, pressed }: { label: string; on?: boolean; danger?: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm text-[10px] font-medium disabled:opacity-40 md:h-12 md:min-w-14 md:flex-none md:shrink-0 md:px-2",
        danger ? "bg-red-600 text-white hover:bg-red-700" : on === false ? "bg-ink/10 text-ink hover:bg-ink/15" : on ? "bg-accent text-white hover:bg-accent/90" : "text-ink hover:bg-ink/5",
      )}
    >
      {children}
      <span className="hidden md:block">{label}</span>
    </button>
  );
}

function RoomInner({ meetingId, entered, onLeaveWhy }: { meetingId: string; entered: Entered; onLeaveWhy: (why: LeaveReason) => void }) {
  const room = useRoomContext();
  const phone = usePhone();
  const { state, refresh, host } = useRoomState(meetingId);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const connection = useConnectionState();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const [view, setView] = useState<"gallery" | "speaker">("gallery");
  const [panel, setPanel] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<Tab>("people");
  const [width, setWidth] = useState(360);
  const [toasts, setToasts] = useState<{ id: number; text: string; quiet?: boolean }[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [announce, setAnnounce] = useState("");
  const [reacting, setReacting] = useState(false);
  const [hostMenu, setHostMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [chime, setChime] = useState(true);
  const [ask, setAsk] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);
  const askDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const moveDialog = useRef<HTMLDialogElement>(null);

  const toast = useCallback((text: string, quiet?: boolean) => {
    const id = ++nextId;
    setToasts((all) => [...all.slice(-3), { id, text, quiet }]);
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4500);
  }, []);

  const publish = useCallback(
    (message: object) => {
      void localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: "meeting" }).catch(() => {});
    },
    [localParticipant],
  );
  const nudge = useCallback(() => {
    void refresh();
    publish({ t: "sync" });
  }, [refresh, publish]);
  // Arrivals, batched when many come at once; a small chime for hosts.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // A reaction: the name comes from who LiveKit says sent it (the room's people list, or the
  // name in their server-signed token), never from the message, so nobody can send as someone else.
  const lastReaction = useRef(new Map<string, number>());
  const heard = useRef<string[]>([]);
  const heardTimer = useRef<number | null>(null);
  const showReaction = useCallback(
    (identity: string, emoji: string, sender?: Participant) => {
      const now = Date.now();
      // One per person per second; a flood from one sender is dropped.
      if (now - (lastReaction.current.get(identity) ?? 0) < 900) return;
      lastReaction.current.set(identity, now);
      const mine = identity === localParticipant.identity;
      const full = stateRef.current?.people.find((p) => p.id === identity)?.name || sender?.name || "Someone";
      const name = mine ? "You" : full.trim().split(/\s+/)[0] || "Someone";

      // On their tile and in People for 4 seconds; a newer reaction from them starts it again.
      setReactions((all) => ({ ...all, [identity]: emoji }));
      window.setTimeout(() => {
        if (Date.now() - (lastReaction.current.get(identity) ?? 0) < 3900) return;
        setReactions((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== identity)));
      }, 4000);

      heard.current.push(`${mine ? "You" : full} reacted ${emoji}`);
      if (heardTimer.current === null) {
        heardTimer.current = window.setTimeout(() => {
          setAnnounce(heard.current.join(". "));
          heard.current = [];
          heardTimer.current = null;
        }, 1500);
      }

      if (quietMotion()) {
        toast(`${name} reacted ${emoji}`, true);
        return;
      }
      const id = ++nextId;
      setFloats((all) => {
        const group = all.find((f) => f.emoji === emoji && now - f.first < FLOAT_MS);
        if (group) {
          if (group.ids.includes(identity)) return all;
          // Many at once with the same emoji: one pill, "Riya, Aman +3", floating up again.
          return all.map((f) => (f === group ? { ...f, id, ids: [...f.ids, identity], names: [...f.names, name] } : f));
        }
        const used = new Set(all.map((f) => f.lane));
        const lane = LANES.findIndex((_, i) => !used.has(i));
        return [...all, { id, emoji, ids: [identity], names: [name], lane: lane < 0 ? all.length % LANES.length : lane, first: now }];
      });
      window.setTimeout(() => setFloats((all) => all.filter((f) => f.id !== id)), FLOAT_MS);
    },
    [localParticipant, toast],
  );
  useEffect(
    () => () => {
      if (heardTimer.current !== null) window.clearTimeout(heardTimer.current);
    },
    [],
  );

  // Notes from others: read the state now; a reaction floats with its sender. Nothing here grants anything.
  useEffect(() => {
    const onData = (payload: Uint8Array, sender?: Participant, _k?: unknown, topic?: string) => {
      if (topic !== "meeting") return;
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as { t?: string; e?: string };
        if (message.t === "sync") void refresh();
        if (message.t === "react" && sender && message.e && REACTIONS.includes(message.e)) showReaction(sender.identity, message.e, sender);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, refresh, showReaction]);
  const chimeRef = useRef(chime);
  useEffect(() => {
    chimeRef.current = chime;
  }, [chime]);
  useEffect(() => {
    let batch: string[] = [];
    let timer: number | null = null;
    const joined = (p: Participant) => {
      batch.push(p.name || "Someone");
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        const names = batch;
        batch = [];
        timer = null;
        toast(names.length === 1 ? `${names[0]} joined` : names.length === 2 ? `${names[0]} and ${names[1]} joined` : `${names[0]} and ${names.length - 1} others joined`);
        if (stateRef.current?.me.is_host && chimeRef.current) tone([660, 880]);
      }, 1200);
    };
    room.on(RoomEvent.ParticipantConnected, joined);
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [room, toast]);

  // What changed in the shared state: rights, knocks, replies to a ring, the meeting ending.
  const was = useRef<{ host: boolean | null; knocks: Set<string>; lobby: Set<string>; cant: Set<string> }>({ host: null, knocks: new Set(), lobby: new Set(), cant: new Set() });
  useEffect(() => {
    if (!state) return;
    const before = was.current;
    if (before.host !== null && before.host !== state.me.is_host) toast(state.me.is_host ? "You are now a co-host" : "You are no longer a co-host");
    before.host = state.me.is_host;
    if (state.me.is_host) {
      const fresh = state.knocks.filter((k) => !before.knocks.has(k.id));
      const freshLobby = state.lobby.filter((l) => !before.lobby.has(l.id));
      if (fresh.length) tone([392, 392]);
      if (freshLobby.length) toast(freshLobby.length === 1 ? `${freshLobby[0].name} is waiting in the lobby` : `${freshLobby.length} people are waiting in the lobby`);
      for (const p of state.people) {
        if (p.ring_answer === "cant" && !before.cant.has(p.id)) {
          before.cant.add(p.id);
          toast(`${p.name} can't join right now`);
        }
      }
    }
    before.knocks = new Set(state.knocks.map((k) => k.id));
    before.lobby = new Set(state.lobby.map((l) => l.id));
    if (state.meeting.phase === "ended" || state.meeting.phase === "cancelled") onLeaveWhy("ended");
    else if (state.me.removed) onLeaveWhy("removed");
  }, [state, toast, onLeaveWhy]);

  // A host turned my microphone or camera off (a click of mine is not that).
  const clicked = useRef(0);
  useEffect(() => {
    const muted = (pub: { source?: Track.Source }, p: Participant) => {
      if (!p.isLocal || Date.now() - clicked.current < 1200) return;
      if (pub.source === Track.Source.Microphone) toast("A host muted you");
      if (pub.source === Track.Source.Camera) toast("A host asked everyone to turn cameras off");
    };
    room.on(RoomEvent.TrackMuted, muted);
    return () => {
      room.off(RoomEvent.TrackMuted, muted);
    };
  }, [room, toast]);

  // The last host leaving while others are still in chooses: the meeting goes on, or it ends.
  const leave = useCallback(() => {
    const s = stateRef.current;
    if (s?.me.is_host) {
      const others = s.people.filter((p) => p.in_room && p.id !== s.me.id);
      if (others.length > 0 && !others.some((p) => p.host_kind)) {
        leaveDialog.current?.showModal();
        return;
      }
    }
    onLeaveWhy("left");
  }, [onLeaveWhy]);

  const act = useCallback(
    (action: string, args: Record<string, unknown> = {}) => {
      void host(action, args).then((problem) => {
        if (problem) toast(problem);
        else if (action === "ring") toast(args.user ? "Ringing…" : "Ringing everyone not joined…");
      });
    },
    [host, toast],
  );
  const confirm = useCallback((title: string, body: string, label: string, run: () => void) => {
    setAsk({ title, body, label, run });
  }, []);
  useEffect(() => {
    if (ask && !askDialog.current?.open) askDialog.current?.showModal();
  }, [ask]);

  const live = useMemo(() => {
    const out: LiveInfo = {};
    for (const p of participants) {
      out[p.identity] = {
        mic: p.isMicrophoneEnabled,
        camera: p.isCameraEnabled,
        quality: p.connectionQuality === ConnectionQuality.Excellent || p.connectionQuality === ConnectionQuality.Good ? "good" : p.connectionQuality === ConnectionQuality.Poor ? "poor" : p.connectionQuality === ConnectionQuality.Lost ? "lost" : "unknown",
      };
    }
    return out;
  }, [participants]);

  const api: RoomApi | null = useMemo(() => (state ? { meetingId, state, live, reactions, host, act, confirm, toast, nudge } : null), [meetingId, state, live, reactions, host, act, confirm, toast, nudge]);

  const toggleMic = async () => {
    clicked.current = Date.now();
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, { ...AUDIO, deviceId: saved(DEVICE_KEYS.microphone) });
    } catch {
      toast("The microphone could not start. Try Fix audio/video.");
    }
  };
  const toggleCamera = async () => {
    clicked.current = Date.now();
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled, { deviceId: saved(DEVICE_KEYS.camera) });
    } catch {
      toast("The camera could not start. Try Fix audio/video.");
    }
  };
  const toggleShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true });
    } catch (e) {
      if (!(e instanceof Error && /NotAllowed|Permission/i.test(e.name))) toast("The screen could not be shared.");
    }
  };
  const fix = async () => {
    clicked.current = Date.now();
    try {
      await room.startAudio();
    } catch {}
    const mic = isMicrophoneEnabled;
    const cam = isCameraEnabled;
    let ok = true;
    try {
      if (cam) {
        await localParticipant.setCameraEnabled(false);
        await localParticipant.setCameraEnabled(true);
      }
    } catch {
      ok = false;
    }
    try {
      if (mic) {
        await localParticipant.setMicrophoneEnabled(false);
        await localParticipant.setMicrophoneEnabled(true, AUDIO);
      }
    } catch {
      ok = false;
    }
    toast(ok ? "Audio and video restarted" : "Your camera or microphone could not restart");
  };
  const raise = async (up: boolean) => {
    await createClient().rpc("meeting_raise_hand", { p_meeting: meetingId, p_up: up });
    nudge();
  };
  // At most one reaction a second from here.
  const sentAt = useRef(0);
  const react = useCallback(
    (emoji: string) => {
      setReacting(false);
      const now = Date.now();
      if (now - sentAt.current < 1000) return;
      sentAt.current = now;
      showReaction(localParticipant.identity, emoji);
      publish({ t: "react", e: emoji });
    },
    [localParticipant, showReaction, publish],
  );
  const openPanel = (next: Tab) => {
    setTab(next);
    if (phone) setSheet(true);
    else setPanel(true);
  };

  // The sidebar's edge can be dragged (20 to 45 % of the window, as far as that fits).
  const dragging = useRef(false);
  const onDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setWidth(Math.min(Math.max(280, window.innerWidth - e.clientX), Math.min(620, window.innerWidth * 0.45)));
  };

  const isHost = state?.me.is_host ?? entered.isHost;
  const canShare = isHost || state?.meeting.screen_share_all !== false;
  const handUp = Boolean(state?.me.hand);
  const locked = state?.meeting.locked ?? false;
  const screenShareSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  return (
    <div className="flex h-full min-h-0 flex-col" onPointerMove={onDrag} onPointerUp={() => (dragging.current = false)}>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1 bg-[#00030D]">
          <Stage state={state} api={api} view={view} phone={phone} reactions={reactions} />
          {(connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting) && (
            <p role="status" className="absolute inset-x-0 top-0 z-20 bg-amber-500 px-3 py-1.5 text-center text-sm font-medium text-black">
              Reconnecting…
            </p>
          )}
          {connection === ConnectionState.Connected && (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) && (
            <p role="status" className="absolute inset-x-0 top-0 z-20 bg-amber-500/95 px-3 py-1 text-center text-xs font-medium text-black">
              Your connection is weak. Turning your camera off can help.
            </p>
          )}
          {isHost && state && (state.knocks.length > 0 || state.lobby.length > 0) && (
            <div className="absolute right-2 top-2 z-30 w-[min(92%,22rem)] space-y-2">
              {state.knocks.slice(0, 3).map((k) => (
                <div key={k.id} className="border border-accent bg-surface p-3 text-sm text-ink shadow-xl" data-knock={k.name}>
                  <p>
                    <span className="font-semibold">{k.name}</span>
                    {k.detail ? ` (${k.detail})` : ""} is knocking{k.note ? `: ‘${k.note}’` : ""}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => act("knock_not_now", { id: k.id })}>
                      Not now
                    </Button>
                    <Button type="button" size="sm" onClick={() => act("knock_let_in", { id: k.id })}>
                      Let in
                    </Button>
                  </div>
                </div>
              ))}
              {state.lobby.length > 0 && (
                <div className="border border-accent bg-surface p-3 text-sm text-ink shadow-xl" data-lobby>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Waiting in the lobby ({state.lobby.length})</p>
                    <Button type="button" size="sm" onClick={() => act("admit_all")}>
                      Admit all
                    </Button>
                  </div>
                  <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                    {state.lobby.map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{l.name}</span>
                        <Button type="button" variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => act("deny", { user: l.id })}>
                          Deny
                        </Button>
                        <Button type="button" size="sm" className="px-2 py-1 text-xs" onClick={() => act("admit", { user: l.id })}>
                          Admit
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
            {floats.map((f) => (
              <span key={f.id} className="meeting-reaction absolute bottom-6 flex flex-col items-center" style={{ left: `${LANES[f.lane]}%` }} data-float={f.emoji}>
                <span className="text-3xl leading-none">{f.emoji}</span>
                <span className="mt-1 whitespace-nowrap rounded-full bg-black/75 px-2 py-0.5 text-xs font-medium text-white" data-float-names>
                  {reactors(f.names)}
                </span>
              </span>
            ))}
          </div>
          <p className="sr-only" aria-live="polite" data-reaction-announce>
            {announce}
          </p>
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 space-y-1.5" role="status" aria-live="polite">
            {toasts.map((t) => (
              <p key={t.id} className="w-fit max-w-xs rounded-sm bg-black/80 px-3 py-1.5 text-sm text-white" aria-hidden={t.quiet || undefined}>
                {t.text}
              </p>
            ))}
          </div>
          <StartAudio label="Tap to enable sound" className="absolute! left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded! bg-[#004df6]! px-6! py-4! text-base! font-semibold! text-white! shadow-xl" />
        </div>

        {!phone && panel && api && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Drag to resize the panel"
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              className="w-1.5 shrink-0 cursor-col-resize touch-none bg-line hover:bg-accent"
            />
            <aside className="h-full min-h-0 shrink-0" style={{ width }} aria-label="Meeting panel">
              <RoomSidebar api={api} tab={tab} onTab={setTab} onClose={() => setPanel(false)} />
            </aside>
          </>
        )}
      </div>

      {phone && sheet && api && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="h-[72dvh] min-h-0">
            <RoomSidebar api={api} tab={tab} onTab={setTab} onClose={() => setSheet(false)} />
          </div>
        </div>
      )}

      <nav aria-label="Meeting controls" className="relative flex shrink-0 items-center gap-0.5 border-t border-line bg-surface px-1 py-1.5 text-ink md:justify-center md:gap-1 md:overflow-x-auto md:px-2">
        <div className="mr-auto hidden min-w-0 max-w-[16rem] truncate pr-3 text-sm font-medium lg:block" title={state?.meeting.title}>
          {state?.meeting.title}
          {locked && <Badge>Locked</Badge>}
        </div>
        <Ctrl label={isMicrophoneEnabled ? "Mute" : "Unmute"} on={isMicrophoneEnabled ? undefined : false} pressed={!isMicrophoneEnabled} onClick={() => void toggleMic()}>
          {isMicrophoneEnabled ? <Mic size={18} aria-hidden /> : <MicOff size={18} aria-hidden />}
        </Ctrl>
        <Ctrl label={isCameraEnabled ? "Stop video" : "Start video"} on={isCameraEnabled ? undefined : false} pressed={!isCameraEnabled} onClick={() => void toggleCamera()}>
          {isCameraEnabled ? <Video size={18} aria-hidden /> : <VideoOff size={18} aria-hidden />}
        </Ctrl>
        {canShare && screenShareSupported && (
          <Ctrl label={isScreenShareEnabled ? "Stop sharing" : "Share screen"} on={isScreenShareEnabled ? true : undefined} pressed={isScreenShareEnabled} onClick={() => void toggleShare()}>
            <MonitorUp size={18} aria-hidden />
          </Ctrl>
        )}
        <Ctrl label={handUp ? "Lower hand" : "Raise hand"} on={handUp ? true : undefined} pressed={handUp} onClick={() => void raise(!handUp)}>
          <Hand size={18} aria-hidden />
        </Ctrl>
        <Ctrl label="React" pressed={reacting} onClick={() => setReacting((v) => !v)}>
          <Smile size={18} aria-hidden />
        </Ctrl>
        <Ctrl label="People" onClick={() => openPanel("people")}>
          <PanelRight size={18} aria-hidden />
        </Ctrl>
        {!phone && (
          <Ctrl label={view === "gallery" ? "Speaker view" : "Gallery view"} onClick={() => setView((v) => (v === "gallery" ? "speaker" : "gallery"))}>
            {view === "gallery" ? <Rows3 size={18} aria-hidden /> : <LayoutGrid size={18} aria-hidden />}
          </Ctrl>
        )}
        {!phone && (
          <Ctrl
            label="Move device"
            onClick={() => {
              setMoving(true);
              moveDialog.current?.showModal();
            }}
          >
            <Smartphone size={18} aria-hidden />
          </Ctrl>
        )}
        <Ctrl label="Fix audio/video" onClick={() => void fix()}>
          <RefreshCw size={18} aria-hidden />
        </Ctrl>
        {isHost && (
          <Ctrl label="Host" pressed={hostMenu} onClick={() => setHostMenu((v) => !v)}>
            <ShieldCheck size={18} aria-hidden />
          </Ctrl>
        )}
        <Ctrl label="Leave" danger onClick={leave}>
          <LogOut size={18} aria-hidden />
        </Ctrl>
      </nav>

      {reacting && (
        <div className="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 gap-1 border border-line bg-surface p-1.5 shadow-xl" role="group" aria-label="Reactions">
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => react(emoji)} aria-label={`React ${emoji}`} className="rounded-sm p-1.5 text-2xl hover:bg-ink/5">
              {emoji}
            </button>
          ))}
        </div>
      )}

      {hostMenu && isHost && (
        <div className="fixed bottom-16 right-2 z-50 w-60 border border-line bg-surface py-1 text-sm text-ink shadow-xl" role="menu" aria-label="Host controls">
          {[
            ["Mute all", () => act("mute_all")],
            ["Ask all to turn cameras off", () => act("cameras_off")],
            ["Lower all hands", () => act("lower_hands")],
            [locked ? "Unlock meeting" : "Lock meeting", () => act("lock", { locked: !locked })],
          ].map(([label, run]) => (
            <button
              key={label as string}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left hover:bg-ink/5"
              onClick={() => {
                (run as () => void)();
                setHostMenu(false);
              }}
            >
              {label as string}
            </button>
          ))}
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/5" onClick={() => setChime((v) => !v)}>
            {chime ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />} Arrival chime: {chime ? "on" : "off"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full border-t border-line px-3 py-2 text-left font-medium text-red-600 hover:bg-red-500/10"
            onClick={() => {
              setHostMenu(false);
              confirm("End the meeting for everyone?", "Everyone will leave the room. The minutes stay available.", "End for all", () => act("end"));
            }}
          >
            End meeting for all
          </button>
        </div>
      )}

      <dialog ref={moveDialog} aria-label="Move to another device" onClose={() => setMoving(false)} className="m-auto w-[min(92vw,24rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60">
        <h2 className="text-center font-serif text-xl">Move to another device</h2>
        <div className="mt-3">{moving && <QrPanel meetingId={meetingId} purpose="move" />}</div>
        <div className="mt-4 text-center">
          <Button type="button" variant="ghost" size="sm" onClick={() => moveDialog.current?.close()}>
            Close
          </Button>
        </div>
      </dialog>

      <dialog ref={leaveDialog} aria-labelledby="meeting-leave" className="m-auto w-[min(92vw,30rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60" data-leave-choice>
        <h2 id="meeting-leave" className="font-serif text-xl">
          You are the last host in the room
        </h2>
        <p className="mt-2 text-sm text-ink/75">The others can carry on without a host, or you can end the meeting for everyone.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => leaveDialog.current?.close()}>
            Stay
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              leaveDialog.current?.close();
              onLeaveWhy("left");
            }}
          >
            Leave (meeting continues)
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-red-600 hover:bg-red-600/90"
            onClick={() => {
              leaveDialog.current?.close();
              void host("end").then((problem) => (problem ? toast(problem) : onLeaveWhy("ended")));
            }}
          >
            End for all
          </Button>
        </div>
      </dialog>

      <dialog ref={askDialog} aria-labelledby="meeting-ask" onClose={() => setAsk(null)} className="m-auto w-[min(92vw,26rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60">
        <h2 id="meeting-ask" className="font-serif text-xl">
          {ask?.title}
        </h2>
        <p className="mt-2 text-sm text-ink/75">{ask?.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => askDialog.current?.close()}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-red-600 hover:bg-red-600/90"
            onClick={() => {
              askDialog.current?.close();
              ask?.run();
            }}
          >
            {ask?.label}
          </Button>
        </div>
      </dialog>
    </div>
  );
}

/**
 * The meeting room: full viewport, the page behind it does not scroll. Everyone on one
 * screen in the gallery (a scrolling grid on a phone), or the speaker large; a screen
 * share takes the main area with everyone else in a strip.
 * No recording and no integrity tracking.
 */
export function MeetingRoom({ meetingId, entered, muted, cameraOff, onLeave }: { meetingId: string; entered: Entered; muted: boolean; cameraOff: boolean; onLeave: (why: LeaveReason) => void }) {
  const phone = usePhone();
  const finished = useRef(false);
  const [options] = useState<RoomOptions>(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? PHONE : LAPTOP));
  const video = useMemo<VideoCaptureOptions | boolean>(() => {
    if (cameraOff) return false;
    const id = saved(DEVICE_KEYS.camera);
    return id ? { deviceId: id } : true;
  }, [cameraOff]);
  const audio = useMemo<AudioCaptureOptions | boolean>(() => {
    if (muted) return false;
    const id = saved(DEVICE_KEYS.microphone);
    return id ? { ...AUDIO, deviceId: id } : true;
  }, [muted]);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  // The tab going away: the time stops now, not 30 seconds later.
  useEffect(() => {
    const beacon = () => navigator.sendBeacon?.(`/api/meetings/${meetingId}/left`);
    window.addEventListener("pagehide", beacon);
    return () => window.removeEventListener("pagehide", beacon);
  }, [meetingId]);

  const finish = useCallback(
    (why: LeaveReason) => {
      if (finished.current) return;
      finished.current = true;
      // On another device the person is still in the meeting.
      if (why !== "moved") navigator.sendBeacon?.(`/api/meetings/${meetingId}/left`);
      onLeave(why);
    },
    [meetingId, onLeave],
  );
  const onDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) finish("moved");
      else if (reason === DisconnectReason.PARTICIPANT_REMOVED) finish("removed");
      else if (reason === DisconnectReason.ROOM_DELETED) finish("ended");
      else if (reason === DisconnectReason.CLIENT_INITIATED) finish("left");
      else finish("lost");
    },
    [finish],
  );
  const onError = useCallback((e: Error) => {
    console.error("meeting room:", e.message);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-surface" style={{ height: phone ? "100dvh" : undefined }}>
      <LiveKitRoom serverUrl={entered.serverUrl} token={entered.token} connect video={video} audio={audio} options={options} onDisconnected={onDisconnected} onError={onError} style={{ height: "100%" }}>
        <RoomAudioRenderer />
        <RoomInner meetingId={meetingId} entered={entered} onLeaveWhy={finish} />
      </LiveKitRoom>
    </div>
  );
}
