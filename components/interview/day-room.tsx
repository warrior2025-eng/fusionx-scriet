"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, PanelRightClose, PanelRightOpen, Video } from "lucide-react";
import { enforceDayRoom, joinDayRoom, type DayRoomNow } from "@/actions/interview-panel";
import type { ParticipantStatus, StageControls } from "@/components/interview/livekit-stage";
import { LiveKitStage } from "@/components/interview/livekit-stage-lazy";
import { HelpPanel, PanelTour, useTourSeen } from "@/components/interview/panel-guide";
import { TileContext, type TileInfo } from "@/components/interview/tile-context";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { Button } from "@/components/ui/button";
import { currentSlot, type DayAccess } from "@/lib/interview/shared";
import { joinErrorText } from "@/lib/interview/join-error";
import { slotRange, slotTime } from "@/lib/recruitment/slots";
import { cn } from "@/lib/utils";

/**
 * Who is in the day's room now (call identities), whether this screen is in the call, each person's camera /
 * microphone / connection (while in the call), and a way to ask a candidate to re-check their devices.
 * Read by the slot sidebar.
 */
type Presence = {
  present: Set<string>;
  seen: Set<string>;
  inCall: boolean;
  now: number | null;
  status: Record<string, ParticipantStatus>;
  ask: ((identity: string) => Promise<void>) | null;
};
const PresenceContext = createContext<Presence | null>(null);

export function useDayPresence(): Presence | null {
  return useContext(PresenceContext);
}

const SIDE_KEY = "fx-panel-sidebar-w";
const MIN_SIDE = 360;

/**
 * The panel's screen for a whole interview day, as a full-window app: the page itself never scrolls. A slim top
 * bar (slot, countdown, next, Help), the video grid (always in view, filling the height), and the sidebar
 * (`children`, the current slot's candidates) with its own scroll; the sidebar can be collapsed ("]") and
 * resized. Below 1024px the video stays on top and the sidebar scrolls under it.
 *
 * The call stays open all day (it lives in the layout, so moving between slots never drops it). While open it
 * runs the room's clean-up every 15 seconds and at each slot boundary, and fetches the page again at each
 * boundary so the sidebar moves to the new slot by itself.
 */
export function DayRoomShell({ access, title, children }: { access: DayAccess; title?: string; children: React.ReactNode }) {
  const router = useRouter();
  const { now, tick } = useServerClock(access.now);
  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(null);
  const [joined, setJoined] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState("");
  const [callPresent, setCallPresent] = useState<string[]>([]);
  const [room, setRoom] = useState<(DayRoomNow & { ok: true }) | null>(null);
  const [checkError, setCheckError] = useState("");
  const [status, setStatus] = useState<Record<string, ParticipantStatus>>({});
  const [controls, setControls] = useState<StageControls | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideW, setSideW] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Record<string, TileInfo>>({});
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(false);
  const [tourSeen, markTourSeen] = useTourSeen();
  // Everyone seen in the room today (to tell "left" from "not joined yet").
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const addSeen = useCallback((ids: string[]) => setSeen((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids]))), []);

  // ── the full-window frame: placed where the page content starts; the page behind it does not scroll ──
  const anchor = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    window.scrollTo(0, 0);
    html.style.overflow = "hidden";
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, Math.round(r.top + window.scrollY));
      // In the admin panel: the content column (beside the admin menu); on the public site: the whole width.
      const pr = (el.closest("main") ?? el.parentElement)?.getBoundingClientRect();
      const left = window.location.pathname.startsWith("/admin") && pr ? Math.round(pr.left) : 0;
      setBox((b) => (b && b.top === top && b.left === left ? b : { top, left, right: 0 }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(document.body);
    window.addEventListener("resize", place);
    return () => {
      html.style.overflow = before;
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  // ── the sidebar: width remembered in this browser; "]" collapses it ──
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const v = Number(localStorage.getItem(SIDE_KEY));
        if (v >= MIN_SIDE) setSideW(v);
      } catch {}
    }, 0);
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "]" || el?.closest("input, textarea, select, [contenteditable]")) return;
      setSideOpen((o) => !o);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const total = frame.current?.getBoundingClientRect();
    if (!total) return;
    const move = (ev: PointerEvent) => {
      const w = Math.min(Math.max(MIN_SIDE, total.right - ev.clientX), total.width * 0.55);
      setSideW(Math.round(w));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSideW((w) => {
        try {
          if (w) localStorage.setItem(SIDE_KEY, String(w));
        } catch {}
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // The first time on this browser: the guided tour.
  useEffect(() => {
    if (tourSeen !== false) return;
    const t = window.setTimeout(() => setTour(true), 800);
    return () => window.clearTimeout(t);
  }, [tourSeen]);

  const slot = tick === null ? null : currentSlot(access.slots, tick);
  const live = slot && tick !== null && tick >= new Date(slot.starts_at).getTime() && tick < new Date(slot.ends_at).getTime();
  const next = tick === null ? null : access.slots.find((s) => new Date(s.starts_at).getTime() > tick && s.id !== slot?.id);
  const left = live && slot && tick !== null ? new Date(slot.ends_at).getTime() - tick : null;
  const lastTwo = left !== null && left <= 2 * 60_000;

  // The room's clean-up: every 15 seconds, and at once at each slot boundary.
  const check = useCallback(async () => {
    if (!access.room_enabled) return;
    const res = await enforceDayRoom(access.day_id).catch(() => null);
    if (res?.ok) {
      setRoom(res);
      addSeen(res.present);
      setCheckError("");
    } else setCheckError(res?.message ?? "Could not check the room.");
  }, [access.day_id, access.room_enabled, addSeen]);
  useEffect(() => {
    const first = window.setTimeout(check, 0);
    const timer = window.setInterval(check, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [check]);
  useEffect(() => {
    let timer = 0;
    // One timer to the next slot start or end; when it fires it sets the one after.
    const arm = () => {
      const t = now();
      const bounds = access.slots.flatMap((s) => [new Date(s.starts_at).getTime(), new Date(s.ends_at).getTime()]).filter((b) => b > t);
      if (!bounds.length) return;
      const at = Math.min(...bounds);
      timer = window.setTimeout(() => {
        void check();
        router.refresh();
        arm();
      }, at - t + 1000);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [access.slots, now, check, router]);

  const join = async () => {
    setJoined("joining");
    setError("");
    const res = await joinDayRoom(access.day_id);
    if (!res.ok) {
      setError(res.message);
      setJoined("idle");
      return;
    }
    setConn({ serverUrl: res.serverUrl, token: res.token });
  };
  const onConnected = useCallback(() => setJoined("joined"), []);
  const onDisconnected = useCallback(() => {
    setConn(null);
    setJoined("idle");
  }, []);
  const onCallError = useCallback((message: string) => {
    setError(joinErrorText(message, "panel"));
    setConn(null);
    setJoined("idle");
  }, []);
  const onPeople = useCallback(
    (ids: string[]) => {
      setCallPresent(ids);
      addSeen(ids);
    },
    [addSeen],
  );

  const ask = useMemo(() => (controls ? (identity: string) => controls.send(identity, "recheck") : null), [controls]);
  const presence = useMemo<Presence>(
    () => ({
      present: new Set(joined === "joined" ? callPresent : (room?.present ?? [])),
      seen,
      inCall: joined === "joined",
      now: tick,
      status: joined === "joined" ? status : {},
      ask: joined === "joined" ? ask : null,
    }),
    [joined, callPresent, room, seen, tick, status, ask],
  );
  const panel = useMemo(() => ({ selected, select: setSelected, tiles, setTiles }), [selected, tiles]);

  return (
    <PresenceContext.Provider value={presence}>
      <TileContext.Provider value={panel}>
        <div ref={anchor} aria-hidden className="h-px" />
        <div
          ref={frame}
          className="fixed bottom-0 z-30 flex flex-col bg-paper"
          style={{ top: box?.top ?? 64, left: box?.left ?? 0, right: box?.right ?? 0, visibility: box ? "visible" : "hidden" }}
        >
          {/* Top bar */}
          <div
            className={cn("flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-sm sm:px-4", lastTwo ? "border-red-600 bg-red-600/10" : "border-line bg-surface")}
            role="status"
            data-tour="topbar"
          >
            {title && <span className="hidden font-serif text-base text-ink md:inline">{title}</span>}
            <p className="text-ink">
              {slot && live ? (
                <>
                  <span className="font-semibold">Now: {slotRange(slot.starts_at, slot.ends_at)}</span>
                  {next && <span className="text-ink/70"> · next {slotTime(next.starts_at)}</span>}
                </>
              ) : slot ? (
                <span className="font-semibold">
                  {tick !== null && tick < new Date(slot.starts_at).getTime() ? `Next: ${slotRange(slot.starts_at, slot.ends_at)}` : "No more slots today"}
                </span>
              ) : (
                <span className="text-ink/70">No slots on this day.</span>
              )}
            </p>
            {left !== null && (
              <p className={cn("tabular-nums", lastTwo ? "font-bold text-red-600 dark:text-red-400" : "font-medium text-ink")} aria-live="off">
                {lastTwo ? "Last 2 minutes: " : "Ends in "}
                {countdownText(left)}
              </p>
            )}
            {!live && slot && tick !== null && tick < new Date(slot.starts_at).getTime() && (
              <p className="tabular-nums text-ink/80">Starts in {countdownText(new Date(slot.starts_at).getTime() - tick)}</p>
            )}
            {access.room_enabled && room && (
              <p className="hidden text-ink/70 sm:block">
                In the room: {room.panel} panel · {room.candidates} candidate{room.candidates === 1 ? "" : "s"}
                {room.phones ? ` · ${room.phones} phone${room.phones === 1 ? "" : "s"}` : ""}
              </p>
            )}
            {checkError && <p className="text-xs text-ink">{checkError}</p>}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHelp(true)}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-medium text-ink/80 hover:bg-ink/5 hover:text-ink"
                aria-label="Help: how to interview and the guide"
              >
                <CircleHelp size={18} aria-hidden /> <span className="hidden sm:inline">Help</span>
              </button>
              <button
                type="button"
                onClick={() => setSideOpen((o) => !o)}
                className="hidden items-center gap-1.5 rounded-sm px-2 py-1 text-ink/80 hover:bg-ink/5 hover:text-ink lg:inline-flex"
                aria-expanded={sideOpen}
                aria-controls="day-room-sidebar"
                title="Hide or show the sidebar (])"
              >
                {sideOpen ? <PanelRightClose size={18} aria-hidden /> : <PanelRightOpen size={18} aria-hidden />}
                <span className="sr-only">{sideOpen ? "Hide sidebar" : "Show sidebar"}</span>
              </button>
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Video: always in view */}
            <div className="relative h-[45vh] shrink-0 bg-black lg:h-auto lg:min-w-0 lg:flex-1">
              {conn && (
                <div className="absolute inset-0">
                  <LiveKitStage
                    serverUrl={conn.serverUrl}
                    token={conn.token}
                    mode="panel"
                    onConnected={onConnected}
                    onDisconnected={onDisconnected}
                    onError={onCallError}
                    onPeople={onPeople}
                    onStatus={setStatus}
                    onControls={setControls}
                  />
                </div>
              )}
              {joined !== "joined" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center" data-tour={conn ? undefined : "video"}>
                  {access.room_enabled ? (
                    <Button onClick={join} disabled={joined === "joining"} data-tour="controls">
                      <Video size={16} aria-hidden /> {joined === "joining" ? "Opening the room…" : "Join the call"}
                    </Button>
                  ) : (
                    <p className="text-sm text-white/85">This day uses Google Meet. Switch it to the in-website room on the Interview slots page to use this call.</p>
                  )}
                  {error && (
                    <p role="alert" className="max-w-md text-sm leading-relaxed text-white">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Resize handle */}
            {sideOpen && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize the sidebar"
                onPointerDown={startDrag}
                className="hidden w-1.5 shrink-0 cursor-col-resize bg-line hover:bg-accent lg:block"
              />
            )}

            {/* Sidebar: its own scroll */}
            <aside
              id="day-room-sidebar"
              aria-label="Candidates"
              className={cn(
                "min-h-0 flex-1 overflow-y-auto border-line bg-paper lg:flex-none lg:border-l",
                !sideOpen && "lg:hidden",
                "w-full lg:min-w-90",
                // Small laptops: video ~60%, sidebar ~40%; larger screens ~68 / 32; or the width dragged to.
                sideW ? "lg:w-(--side-w)" : "lg:w-[40%] min-[1400px]:w-[32%]",
              )}
              style={sideW ? ({ "--side-w": `${sideW}px` } as React.CSSProperties) : undefined}
            >
              {children}
            </aside>
          </div>
        </div>
        <PanelTour
          open={tour}
          onClose={() => {
            setTour(false);
            markTourSeen();
          }}
        />
        <HelpPanel
          open={help}
          onClose={() => setHelp(false)}
          onTour={() => {
            setHelp(false);
            setTour(true);
          }}
        />
      </TileContext.Provider>
    </PresenceContext.Provider>
  );
}
