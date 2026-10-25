"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Eye, EyeOff, MicOff, RefreshCw, Smartphone, Video, VideoOff, Wifi, WifiOff } from "lucide-react";
import { hideQuestion, joinAsPanel, removeFromRoom, revealQuestion, revealedIds, slotEvents } from "@/actions/interview-panel";
import { ActionButton } from "@/components/admin/action-button";
import { useDayPresence } from "@/components/interview/day-room";
import type { ParticipantStatus } from "@/components/interview/livekit-stage";
import { LiveKitStage } from "@/components/interview/livekit-stage-lazy";
import { Pill } from "@/components/admin/ui";
import { TONE_CLASS, useDayPanel, type StateTone, type TileInfo } from "@/components/interview/tile-context";
import { Button } from "@/components/ui/button";
import { EVENT_LABELS, FLAG_TYPES, phoneUserId, type IntegrityEvent, type IntegrityType, type PhoneCameraSetting } from "@/lib/interview/shared";
import { slotTime } from "@/lib/recruitment/slots";
import { joinErrorText } from "@/lib/interview/join-error";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type PanelPerson = {
  booking_id: string;
  name: string;
  status: "booked" | "attended" | "no_show";
  hubs: string;
  consented_at: string | null;
  hubList?: string[];
  year?: string | null;
  department?: string | null;
};

/** The admin Pill tones in the day panel's colours (the same on the video tile and the card). */
const PILL_TONE: Record<Tone, StateTone> = { good: "green", warn: "amber", bad: "red", neutral: "grey" };

function StateChip({ tone, children, className }: { tone: StateTone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-semibold", TONE_CLASS[tone], className)}>{children}</span>;
}
export type BankItem = { id: string; hub: string; body: string };

/** Pauses polling while the tab is hidden (realtime still brings changes in). */
function useVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** Integrity events for the slot: Supabase Realtime, with a poll behind it (RLS limits a reviewer to their candidates). */
function useSlotEvents(slotId: string, initial: IntegrityEvent[]) {
  const [events, setEvents] = useState(initial);
  const lastId = useRef(initial.reduce((m, e) => Math.max(m, e.id), 0));
  const visible = useVisible();
  useEffect(() => {
    let stop = false;
    const add = (list: IntegrityEvent[]) => {
      if (!list.length) return;
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const next = [...prev, ...list.filter((e) => !seen.has(e.id))].sort((a, b) => a.id - b.id);
        lastId.current = next.reduce((m, e) => Math.max(m, e.id), lastId.current);
        return next;
      });
    };
    const poll = async () => {
      const list = await slotEvents(slotId, lastId.current).catch(() => []);
      if (!stop) add(list);
    };
    // Back on the tab: catch up at once.
    if (visible) void poll();
    const timer = visible ? window.setInterval(poll, 5000) : 0;
    const supabase = createClient();
    const channel = supabase
      .channel(`integrity-${slotId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recruitment_integrity_events", filter: `slot_id=eq.${slotId}` }, (payload) =>
        add([payload.new as IntegrityEvent]),
      )
      .subscribe();
    return () => {
      stop = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [slotId, visible]);
  return events;
}

/** "Tab switched away 2×: 10:42 AM, 10:45 AM" lines for one candidate. */
function Summary({ events }: { events: IntegrityEvent[] }) {
  const flags = FLAG_TYPES.map((type) => ({ type, list: events.filter((e) => e.type === type) })).filter((f) => f.list.length > 0);
  if (flags.length === 0) return <p className="text-sm text-ink/70">No flags.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {flags.map(({ type, list }) => (
        <li key={type} className="text-ink">
          <span className="font-medium">
            {EVENT_LABELS[type]} {list.length}×
          </span>
          <span className="text-ink/70">: {list.slice(-6).map((e) => slotTime(e.occurred_at)).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

type Tone = "good" | "neutral" | "warn" | "bad";
type Live = { inDay: boolean; present: boolean; seen: boolean; quality?: ParticipantStatus["quality"]; late: boolean; status: PanelPerson["status"] };

/**
 * From a candidate's events (and, in the day room, whether they are in the call): the device they joined on, where
 * they are now, how often and how long they left the interview screen, and whether they were removed.
 *
 * "Away" is shown only while they are still in the room and their last screen event is a leave. Closing the tab or
 * the browser, a disconnect, a removal or the slot ending all end an absence: then the state says so instead (grey).
 * A leave followed within 10 seconds by "left the room" is the page closing and is not counted (as on the server).
 */
function screenState(events: IntegrityEvent[], now: number, live: Live | null) {
  let device: Record<string, unknown> | null = null;
  let open: IntegrityEvent | null = null;
  let leaves = 0;
  let seconds = 0;
  let removed: { label: string } | null = null;
  let slotEnded = false;
  let leftRoom = false;
  let rejoinedAt = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "device_info") device = e.detail;
    if (e.type === "left_screen") {
      const next = events.slice(i + 1).find((x) => x.type === "returned_screen" || x.type === "left_room");
      const closing = next?.type === "left_room" && new Date(next.occurred_at).getTime() - new Date(e.occurred_at).getTime() <= 10_000;
      if (!closing) leaves += 1;
      open = closing ? null : e;
    }
    if (e.type === "returned_screen") {
      open = null;
      seconds += Math.max(0, Number(e.detail?.seconds ?? 0));
    }
    if (e.type === "left_room") {
      open = null;
      leftRoom = true;
    }
    if (e.type === "rejoined") {
      open = null;
      leftRoom = false;
      rejoinedAt = new Date(e.occurred_at).getTime();
    }
    if (e.type === "removed_left_screen") removed = { label: "Removed for leaving the interview screen" };
    if (e.type === "removed_by_panel")
      removed = { label: `Removed by panel${e.detail?.by ? ` (${String(e.detail.by)})` : ""}${e.detail?.reason ? `: ${String(e.detail.reason)}` : ""}` };
    if (e.type === "removed_slot_ended") slotEnded = true;
  }
  // Without the call to go by (the per-slot page), the last event decides.
  const inRoom = live?.inDay ? live.present : !leftRoom && !removed && !slotEnded;
  const away = open && inRoom && !removed && !slotEnded ? open : null;
  const awayFor = away ? Math.max(0, Math.round((now - new Date(away.occurred_at).getTime()) / 1000)) : 0;

  let state: { label: string; tone: Tone };
  if (removed) state = { label: removed.label, tone: "neutral" };
  else if (slotEnded) state = { label: "Slot ended", tone: "neutral" };
  else if (live?.inDay && live.present && live.quality === "lost") state = { label: "Reconnecting…", tone: "warn" };
  else if (away) state = { label: `Away from screen · ${awayFor}s`, tone: "bad" };
  else if (live?.inDay && live.present) state = now - rejoinedAt < 60_000 ? { label: "Rejoined", tone: "good" } : { label: "In the room", tone: "good" };
  else if (live?.inDay && (live.seen || leftRoom)) state = { label: "Left the room", tone: "neutral" };
  else if (live?.inDay) state = live.late && live.status === "booked" ? { label: "Not joined yet", tone: "warn" } : { label: "Not in the room yet", tone: "neutral" };
  else if (leftRoom) state = { label: "Left the room", tone: "neutral" };
  else state = { label: "", tone: "neutral" };
  return { device, away, awayFor, leaves, seconds: Math.round(seconds + awayFor), removed: removed?.label ?? null, state };
}

const nth = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** The panel takes a candidate out of the room for the rest of their slot, with a reason (logged). */
function RemoveFromRoom({ bookingId, name }: { bookingId: string; name: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Remove from the room…</summary>
      <label className="mt-3 block text-sm text-ink" htmlFor={`reason-${bookingId}`}>
        Reason (shown in the timeline and the audit log)
      </label>
      <input
        id={`reason-${bookingId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink"
      />
      <Button
        className="mt-3"
        variant="secondary"
        size="sm"
        disabled={busy || reason.trim().length < 3}
        onClick={async () => {
          if (!window.confirm(`Remove ${name} from the room? They cannot rejoin this slot.`)) return;
          setBusy(true);
          const res = await removeFromRoom(bookingId, reason);
          setBusy(false);
          setMessage(res.message);
        }}
      >
        {busy ? "Removing…" : `Remove ${name}`}
      </Button>
      {message && (
        <p className="mt-2 text-sm text-ink" role="status">
          {message}
        </p>
      )}
    </details>
  );
}

type Tab = "candidates" | "questions" | "scores" | "checklist";

/**
 * The interview panel for one slot: the call (owner token), a live integrity
 * sidebar per candidate, each candidate's summary and scoring (rendered on
 * the server, passed in as `details` and `scores`), and, for admins, the
 * question bank. Signals are for the panel's judgement: they show what
 * happened, not why.
 *
 * `dayMode`: the sidebar of the day room (the call is the day's, in
 * DayRoomShell; who is in the room and their camera / microphone come from
 * there), in three tabs: Candidates, Questions, Scores.
 */
export function PanelRoom({
  slotId,
  role,
  people,
  details,
  scores,
  initialEvents,
  bank,
  initialRevealed,
  phoneSetting,
  roomEnabled,
  dayMode = false,
  slotStartsAt,
  slotEndsAt,
  attendance,
  application,
  scored,
}: {
  slotId: string;
  role: "admin" | "reviewer";
  people: PanelPerson[];
  details: Record<string, React.ReactNode>;
  scores?: Record<string, React.ReactNode>;
  initialEvents: IntegrityEvent[];
  bank: BankItem[];
  initialRevealed: string[];
  phoneSetting: PhoneCameraSetting;
  roomEnabled: boolean;
  dayMode?: boolean;
  slotStartsAt?: string;
  slotEndsAt?: string;
  /** The day room's compact cards: attendance buttons (admins), the application, whether this panel member has scored. */
  attendance?: Record<string, React.ReactNode>;
  application?: Record<string, React.ReactNode>;
  scored?: Record<string, boolean>;
}) {
  const day = useDayPresence();
  const panelCtx = useDayPanel();
  const events = useSlotEvents(slotId, initialEvents);
  const visible = useVisible();
  const [selected, setSelected] = useState(people[0]?.booking_id ?? "");
  const [tab, setTab] = useState<Tab>("candidates");
  const [joined, setJoined] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState("");
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(new Set(initialRevealed));
  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(null);
  const [asked, setAsked] = useState<Record<string, number>>({});
  // A clock for "away for 12 s" (ticks every second).
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  // Another panel member may reveal or hide too (not while this tab is hidden).
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(async () => {
      const list = await revealedIds(slotId).catch(() => null);
      if (list) setRevealed(new Set(list));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [slotId, visible]);

  const byPerson = useMemo(() => {
    const map: Record<string, IntegrityEvent[]> = {};
    for (const e of events) (map[e.booking_id] ??= []).push(e);
    return map;
  }, [events]);

  /** Phone camera: live from the call when the panel is in it, otherwise the last join/leave event. */
  const phoneOn = (bookingId: string) => {
    if (dayMode && day) return day.present.has(phoneUserId(bookingId));
    if (joined === "joined") return present.has(phoneUserId(bookingId));
    const last = [...(byPerson[bookingId] ?? [])].reverse().find((e) => e.type === "phone_camera_joined" || e.type === "phone_camera_left");
    return last?.type === "phone_camera_joined";
  };

  const join = async () => {
    setJoined("joining");
    setError("");
    const res = await joinAsPanel(slotId);
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
  const onPeople = useCallback((ids: string[]) => setPresent(new Set(ids)), []);

  const liveOf = (p: PanelPerson): Live | null =>
    dayMode && day
      ? {
          inDay: true,
          present: day.present.has(p.booking_id),
          seen: day.seen.has(p.booking_id),
          quality: day.status[p.booking_id]?.quality,
          late: Boolean(slotStartsAt && day.now !== null && day.now > new Date(slotStartsAt).getTime() + 2 * 60_000),
          status: p.status,
        }
      : null;
  const stateOf = (p: PanelPerson) => screenState(byPerson[p.booking_id] ?? [], clock ?? 0, liveOf(p));

  // In the day room the selection is shared with the video grid (a click on a tile selects the card).
  const sel = dayMode && panelCtx?.selected && people.some((p) => p.booking_id === panelCtx.selected) ? panelCtx.selected : selected;
  const choose = (id: string) => {
    setSelected(id);
    panelCtx?.select(id);
  };
  const person = people.find((p) => p.booking_id === sel);
  const toneOf = (p: PanelPerson): { label: string; tone: StateTone } => {
    const st = stateOf(p);
    if (st.away) return { label: `Away · ${st.awayFor}s`, tone: "red" };
    const base = { label: st.state.label || "Booked", tone: PILL_TONE[st.state.tone] };
    const m = dayMode && day?.inCall && day.present.has(p.booking_id) ? day.status[p.booking_id] : undefined;
    const evs = byPerson[p.booking_id] ?? [];
    const lastFix = [...evs].reverse().find((e) => e.type === "devices_fixed");
    const blocked = evs.some((e) => e.type === "device_error" && e.detail?.kind === "permission_denied" && (!lastFix || e.id > lastFix.id));
    if (base.tone === "grey") return base;
    if (blocked) return { label: "Camera blocked", tone: "red" };
    if (m && m.camera && !m.video) return { label: "No video received", tone: "red" };
    if (m && (m.quality === "poor" || !m.camera) && base.tone === "green") return { label: !m.camera ? "Camera off" : "Poor connection", tone: "amber" };
    return base;
  };
  const mine = byPerson[sel] ?? [];
  const screen = person ? stateOf(person) : null;
  const media = person && dayMode && day?.inCall && day.present.has(person.booking_id) ? day.status[person.booking_id] : undefined;

  const tileInfo: Record<string, TileInfo> = {};
  if (dayMode) for (const p of people) tileInfo[p.booking_id] = { hubs: p.hubList ?? (p.hubs ? p.hubs.split(", ") : []), state: toneOf(p) };
  const tileKey = JSON.stringify(tileInfo);
  const setTiles = panelCtx?.setTiles;
  useEffect(() => {
    if (!dayMode || !setTiles) return;
    setTiles(JSON.parse(tileKey) as Record<string, TileInfo>);
  }, [dayMode, setTiles, tileKey]);

  const chips = (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Candidates in this slot">
      {people.map((p) => {
        const flags = (byPerson[p.booking_id] ?? []).filter((e) => FLAG_TYPES.includes(e.type as IntegrityType)).length;
        const s = stateOf(p);
        const away = Boolean(s.away);
        const missing = s.state.label === "Not joined yet";
        return (
          <button
            key={p.booking_id}
            type="button"
            role="tab"
            aria-selected={p.booking_id === sel}
            onClick={() => choose(p.booking_id)}
            className={cn(
              "border px-3 py-1.5 text-left text-sm",
              p.booking_id === sel ? "border-accent bg-accent text-white" : "border-ink/25 text-ink hover:border-ink/60",
              missing && p.booking_id !== sel && "border-dashed border-accent",
              away && "border-red-500 bg-red-500/15 text-ink",
            )}
          >
            {p.name}
            {flags > 0 && <span className="ml-1.5 tabular-nums">({flags})</span>}
            {missing && <span className="ml-1.5 text-xs">· not joined</span>}
            {away && <span className="ml-1.5 text-xs font-semibold">· away</span>}
          </button>
        );
      })}
    </div>
  );

  const statusCard = person && screen && (
    <div className="border border-line bg-surface p-4 sm:p-5">
      {!dayMode && (
        <>
          <h2 className="font-serif text-lg text-ink">{person.name}</h2>
          <p className="mt-1 text-xs text-ink/70">{person.hubs}</p>
        </>
      )}
      {screen.away && (
        <p role="alert" className="mt-3 border border-red-500/60 bg-red-500/15 px-3 py-2 text-sm font-semibold text-ink">
          Away from the interview screen · {screen.awayFor}s · {nth(screen.leaves)} time
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {screen.state.label && !screen.away && <Pill tone={screen.state.tone}>{screen.state.label}</Pill>}
        <Pill tone={person.status === "attended" ? "good" : person.status === "no_show" ? "bad" : "neutral"}>
          {person.status === "attended" ? "Attended" : person.status === "no_show" ? "No-show" : "Booked"}
        </Pill>
        {person.consented_at ? <Pill tone="good">Agreed to the rules {slotTime(person.consented_at)}</Pill> : !dayMode && <Pill tone="warn">Not joined yet</Pill>}
        {screen.device && (
          <Pill>
            {String(screen.device.device ?? "Device")}
            {screen.device.browser ? ` · ${String(screen.device.browser)}` : ""}
          </Pill>
        )}
        {screen.device && screen.device.fullscreen === false && <Pill tone="warn">Fullscreen not available</Pill>}
        {phoneSetting !== "off" && screen.device?.phone_camera === false && <Pill tone="neutral">Phone-only: no second camera</Pill>}
        {phoneSetting !== "off" &&
          screen.device?.phone_camera !== false &&
          (phoneOn(person.booking_id) ? (
            <Pill tone="good">
              <Smartphone size={12} aria-hidden /> Phone camera on
            </Pill>
          ) : (
            <Pill tone={phoneSetting === "required" ? "bad" : "neutral"}>
              <Smartphone size={12} aria-hidden /> Phone camera {phoneSetting === "required" ? "missing (required)" : "not connected"}
            </Pill>
          ))}
      </p>
      {media && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {!media.mic && (
            <Pill tone="warn">
              <MicOff size={12} aria-hidden /> Mic muted
            </Pill>
          )}
          {!media.camera ? (
            <Pill tone="warn">
              <VideoOff size={12} aria-hidden /> Camera off
            </Pill>
          ) : (
            !media.video && (
              <Pill tone="bad">
                <VideoOff size={12} aria-hidden /> No video received
              </Pill>
            )
          )}
          {media.quality === "poor" ? (
            <Pill tone="warn">
              <Wifi size={12} aria-hidden /> Connection poor
            </Pill>
          ) : media.quality === "lost" ? (
            <Pill tone="bad">
              <WifiOff size={12} aria-hidden /> Connection lost
            </Pill>
          ) : media.quality === "good" ? (
            <Pill tone="good">
              <Wifi size={12} aria-hidden /> Connection good
            </Pill>
          ) : null}
        </p>
      )}
      {dayMode && day?.ask && day.present.has(person.booking_id) && (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          disabled={(asked[person.booking_id] ?? 0) > (clock ?? 0) - 10_000}
          onClick={async () => {
            await day.ask?.(person.booking_id).catch(() => {});
            setAsked((a) => ({ ...a, [person.booking_id]: Date.now() }));
          }}
        >
          <RefreshCw size={14} aria-hidden /> {(asked[person.booking_id] ?? 0) > (clock ?? 0) - 10_000 ? "Asked" : "Ask to re-check devices"}
        </Button>
      )}
      <h3 className="mt-5 text-sm font-semibold text-ink" data-tour="integrity">Integrity</h3>
      <p className="mb-2 text-xs text-ink/65">Signals to help the panel judge. They show what happened, not why.</p>
      {screen.leaves > 0 && (
        <p className="mb-2 text-sm font-medium text-ink">
          Time away from the interview screen: {screen.seconds}s in total ({screen.leaves}×)
        </p>
      )}
      <Summary events={mine} />
      {mine.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ink/75">Timeline ({mine.length})</summary>
          <ol className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs" aria-live="polite">
            {[...mine].reverse().map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-16 shrink-0 tabular-nums text-ink/65">{slotTime(e.occurred_at)}</span>
                <span className="text-ink">
                  {e.type === "left_room" && e.detail?.reason === "closed" ? "Left the room (closed the page)" : (EVENT_LABELS[e.type] ?? e.type)}
                  {e.type === "device_error" && e.detail?.kind ? `: ${String(e.detail.device ?? "")} ${String(e.detail.kind).replace(/_/g, " ")}` : ""}
                  {e.type === "returned_screen" && e.detail?.seconds !== undefined ? ` (${String(e.detail.seconds)} s)` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {dayMode && !screen.removed && (
        <div className="mt-4" data-tour="remove">
          <RemoveFromRoom key={person.booking_id} bookingId={person.booking_id} name={person.name} />
        </div>
      )}
    </div>
  );

  const bankSection =
    role === "admin" && bank.length > 0 ? (
      <section aria-labelledby="bank-title" className="border border-line bg-surface p-4 sm:p-5">
        <h2 id="bank-title" className="font-serif text-lg text-ink">
          Questions
        </h2>
        <p className="mt-1 text-xs text-ink/70">Revealed questions appear on every candidate&rsquo;s screen in this slot, live. Others never leave the server.</p>
        <ul className="mt-4 space-y-3">
          {bank.map((q) => {
            const shown = revealed.has(q.id);
            return (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 last:border-0">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="block text-xs text-ink/65">{q.hub}</span>
                  <span className="whitespace-pre-line text-ink">{q.body}</span>
                </div>
                {shown ? (
                  <ActionButton
                    variant="ghost"
                    action={async () => {
                      const r = await hideQuestion(slotId, q.id);
                      if (r.status === "success") setRevealed((s) => new Set([...s].filter((id) => id !== q.id)));
                      return r;
                    }}
                  >
                    <EyeOff size={14} aria-hidden /> Hide
                  </ActionButton>
                ) : (
                  <ActionButton
                    action={async () => {
                      const r = await revealQuestion(slotId, q.id);
                      if (r.status === "success") setRevealed((s) => new Set([...s, q.id]));
                      return r;
                    }}
                  >
                    <Eye size={14} aria-hidden /> Reveal
                  </ActionButton>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  if (dayMode) {
    // The slot's checklist, ticked from real data (resets with the slot: this sidebar is the slot's).
    const endsIn = slotEndsAt && clock !== null ? new Date(slotEndsAt).getTime() - clock : null;
    const nearEnd = endsIn !== null && endsIn > 0 && endsIn <= 2 * 60_000;
    const checks = [
      { label: "All candidates joined or marked", done: people.length > 0 && people.every((p) => day?.present.has(p.booking_id) || day?.seen.has(p.booking_id) || p.status !== "booked") },
      { label: "Attendance marked", done: people.length > 0 && people.every((p) => p.status !== "booked") },
      { label: "Questions asked", done: revealed.size > 0 },
      { label: "Every candidate scored", done: people.length > 0 && people.every((p) => scored?.[p.booking_id]) },
    ];
    const doneCount = checks.filter((c) => c.done).length;
    const tabs: { id: Tab; label: string }[] = [
      { id: "candidates", label: `Candidates (${people.length})` },
      { id: "questions", label: "Questions" },
      { id: "scores", label: "Scores" },
      { id: "checklist", label: `Checklist ${doneCount}/${checks.length}` },
    ];
    const checklist = (
      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn(
              "flex items-center gap-2 border px-3 py-2 text-sm",
              c.done ? TONE_CLASS.green : nearEnd ? TONE_CLASS.amber : "border-line text-ink",
            )}
          >
            {c.done ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
            {c.label}
            <span className="sr-only">{c.done ? "done" : "not yet"}</span>
          </li>
        ))}
      </ul>
    );
    return (
      <div>
        <div className="sticky top-0 z-10 border-b border-line bg-paper">
          <div className="flex" role="tablist" aria-label="Panel sidebar">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-tour={`tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px flex-1 border-b-2 px-1.5 py-2.5 text-[13px] font-medium",
                  tab === t.id ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink",
                  t.id === "checklist" && nearEnd && doneCount < checks.length && "text-amber-700 dark:text-amber-400",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* The checklist at a glance. */}
          <div className="flex flex-wrap gap-1 px-3 py-1.5" aria-label="Checklist summary">
            {checks.map((c) => (
              <StateChip key={c.label} tone={c.done ? "green" : nearEnd ? "amber" : "grey"} className="font-medium">
                {c.done ? "✓" : "○"} {c.label.replace("All candidates joined or marked", "Joined").replace("Attendance marked", "Attendance").replace("Questions asked", "Questions").replace("Every candidate scored", "Scored")}
              </StateChip>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-3">
          {tab === "candidates" &&
            (people.length === 0 ? (
              <p className="text-sm text-ink/70">No candidates in this slot.</p>
            ) : (
              people.map((p) => {
                const t = toneOf(p);
                const open = p.booking_id === sel;
                const flags = (byPerson[p.booking_id] ?? []).filter((e) => FLAG_TYPES.includes(e.type as IntegrityType)).length;
                return (
                  <div key={p.booking_id} className={cn("border bg-surface", open ? "border-accent" : "border-line", "border-l-4", { green: "border-l-emerald-600", amber: "border-l-amber-500", red: "border-l-red-600", grey: "border-l-ink/30" }[t.tone])}>
                    <button
                      type="button"
                      onClick={() => choose(p.booking_id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-3 px-3 pt-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white" aria-hidden>
                        {p.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-ink">{p.name}</span>
                          <StateChip tone={t.tone}>{t.label}</StateChip>
                          {flags > 0 && <span className="text-xs text-ink/70">{flags} flag{flags === 1 ? "" : "s"}</span>}
                        </span>
                        {(p.year || p.department) && <span className="block text-xs text-ink/70">{[p.year, p.department].filter(Boolean).join(" · ")}</span>}
                        <span className="mt-1 flex flex-wrap gap-1">
                          {(p.hubList ?? []).map((h) => (
                            <span key={h} className="rounded-sm bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink/80">
                              {h}
                            </span>
                          ))}
                        </span>
                      </span>
                      <ChevronDown size={18} className={cn("mt-1 shrink-0 text-ink/60 transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
                      {attendance?.[p.booking_id]}
                      <StateChip tone={p.status !== "booked" ? "green" : nearEnd ? "amber" : "grey"}>
                        {p.status === "attended" ? "Attended" : p.status === "no_show" ? "No-show" : "Attendance not marked"}
                      </StateChip>
                      <StateChip tone={scored?.[p.booking_id] ? "green" : nearEnd ? "amber" : "grey"}>{scored?.[p.booking_id] ? "Scored" : "Not scored"}</StateChip>
                    </div>
                    {open && (
                      <div className="space-y-4 border-t border-line px-3 py-3">
                        {statusCard}
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-ink">Application</h3>
                          {application?.[p.booking_id] ?? details[p.booking_id]}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ))}
          {tab === "questions" && (bankSection ?? <p className="text-sm text-ink/70">{role === "admin" ? "No questions for these hubs yet." : "Admins reveal the questions."}</p>)}
          {tab === "scores" &&
            (people.length === 0 ? (
              <p className="text-sm text-ink/70">No candidates in this slot.</p>
            ) : (
              <div className="space-y-3">
                {chips}
                {person && (scores?.[person.booking_id] ?? <p className="text-sm text-ink/70">Nothing to score for you here.</p>)}
              </div>
            ))}
          {tab === "checklist" && (
            <div className="space-y-3">
              <p className="text-sm text-ink/75">Resets each slot. Unticked items turn amber 2 minutes before the slot ends.</p>
              {checklist}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-4">
        <div className="relative aspect-video w-full bg-black">
          {conn && (
            <div className="absolute inset-0">
              <LiveKitStage serverUrl={conn.serverUrl} token={conn.token} mode="panel" onConnected={onConnected} onDisconnected={onDisconnected} onError={onCallError} onPeople={onPeople} />
            </div>
          )}
          {joined !== "joined" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center">
              {roomEnabled ? (
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
        {bankSection}
      </div>

      <aside aria-label="Candidates" className="min-w-0 space-y-4">
        {chips}
        {person ? (
          <div className="space-y-4">
            {statusCard}
            {scores?.[person.booking_id]}
            {details[person.booking_id]}
          </div>
        ) : (
          <p className="text-sm text-ink/70">No candidates in this slot.</p>
        )}
      </aside>
    </div>
  );
}
