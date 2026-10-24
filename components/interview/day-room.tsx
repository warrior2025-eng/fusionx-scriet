"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelRightClose, PanelRightOpen, Video } from "lucide-react";
import { enforceDayRoom, joinDayRoom, type DayRoomNow } from "@/actions/interview-panel";
import type { ParticipantStatus, StageControls } from "@/components/interview/livekit-stage";
import { LiveKitStage } from "@/components/interview/livekit-stage-lazy";
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

/**
 * The panel's screen for a whole interview day: one call that stays open all
 * day (it lives in the layout, so moving between slots never drops it), the
 * slot on now with a countdown and a 2-minute warning, and the sidebar
 * (`children`, the current slot's candidates) beside it.
 *
 * While open it runs the room's clean-up every 15 seconds and at each slot
 * boundary (the server removes whoever's slot is over), and fetches the page
 * again at each boundary so the sidebar moves to the new slot by itself.
 */
export function DayRoomShell({ access, children }: { access: DayAccess; children: React.ReactNode }) {
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
  // Everyone seen in the room today (to tell "left" from "not joined yet").
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const addSeen = useCallback((ids: string[]) => setSeen((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids]))), []);

  const slot = tick === null ? null : currentSlot(access.slots, tick);
  const live = slot && tick !== null && tick >= new Date(slot.starts_at).getTime() && tick < new Date(slot.ends_at).getTime();
  const next = tick === null ? null : access.slots.find((s) => new Date(s.starts_at).getTime() > tick && s.id !== slot?.id);
  const left = live && slot && tick !== null ? new Date(slot.ends_at).getTime() - tick : null;

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

  return (
    <PresenceContext.Provider value={presence}>
      <div className={cn("grid gap-4", sideOpen && "lg:grid-cols-[minmax(0,7fr)_minmax(19rem,3fr)]")}>
        <div className="min-w-0 space-y-3">
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-5 gap-y-2 border bg-surface px-4 py-2.5 text-sm",
              left !== null && left <= 2 * 60_000 ? "border-accent" : "border-line",
            )}
            role="status"
          >
            <p className="text-ink">
              {slot && live ? (
                <>
                  <span className="font-semibold">Now: {slotRange(slot.starts_at, slot.ends_at)}</span>
                  {next && <span className="text-ink/70"> · next: {slotTime(next.starts_at)}</span>}
                </>
              ) : slot ? (
                <span className="font-semibold">{tick !== null && tick < new Date(slot.starts_at).getTime() ? `Next: ${slotRange(slot.starts_at, slot.ends_at)}` : "No more slots today"}</span>
              ) : (
                <span className="text-ink/70">No slots on this day.</span>
              )}
            </p>
            {left !== null && (
              <p className={cn("tabular-nums", left <= 2 * 60_000 ? "font-semibold text-accent" : "text-ink")} aria-live="off">
                {left <= 2 * 60_000 ? "2-minute warning: " : "Slot ends in "}
                {countdownText(left)}
              </p>
            )}
            {!live && slot && tick !== null && tick < new Date(slot.starts_at).getTime() && (
              <p className="tabular-nums text-ink/80">Starts in {countdownText(new Date(slot.starts_at).getTime() - tick)}</p>
            )}
            {access.room_enabled && room && (
              <p className="text-ink/75">
                In the room: {room.panel} panel · {room.candidates} candidate{room.candidates === 1 ? "" : "s"}
                {room.phones ? ` · ${room.phones} phone${room.phones === 1 ? "" : "s"}` : ""}
              </p>
            )}
            <button
              type="button"
              onClick={() => setSideOpen((o) => !o)}
              className="ml-auto hidden items-center gap-1.5 text-ink/80 hover:text-ink lg:inline-flex"
              aria-expanded={sideOpen}
              aria-controls="day-room-sidebar"
            >
              {sideOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
              {sideOpen ? "Hide sidebar" : "Show sidebar"}
            </button>
          </div>

          {/* The video fits a laptop screen: the candidates large, the panel in a strip, controls at the bottom. */}
          <div className="relative h-[min(72vh,calc(100dvh-12rem))] min-h-[22rem] w-full bg-black">
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
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center">
                {access.room_enabled ? (
                  <Button onClick={join} disabled={joined === "joining"}>
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

          {access.room_enabled && (
            <p className="text-xs text-ink/70">
              {room ? `Checked ${slotTime(room.at)}${room.removed ? `; ${room.removed} removed (slot over)` : ""}.` : "Checking the room…"} Candidates are let in for
              their own slot only and removed when it ends.
              {checkError && <span className="block text-ink">{checkError}</span>}
            </p>
          )}
        </div>

        <aside id="day-room-sidebar" aria-label="Candidates" className={cn("min-w-0", !sideOpen && "lg:hidden")}>
          {children}
        </aside>
      </div>
    </PresenceContext.Provider>
  );
}
