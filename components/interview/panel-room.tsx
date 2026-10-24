"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Smartphone, Video } from "lucide-react";
import { hideQuestion, joinAsPanel, revealQuestion, revealedIds, slotEvents } from "@/actions/interview-panel";
import { ActionButton } from "@/components/admin/action-button";
import { useDayPresence } from "@/components/interview/day-room";
import { LiveKitStage } from "@/components/interview/livekit-stage";
import { Pill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { EVENT_LABELS, FLAG_TYPES, phoneUserId, type IntegrityEvent, type IntegrityType, type PhoneCameraSetting } from "@/lib/interview/shared";
import { slotTime } from "@/lib/recruitment/slots";
import { joinErrorText } from "@/lib/interview/join-error";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type PanelPerson = { booking_id: string; name: string; status: "booked" | "attended" | "no_show"; hubs: string; consented_at: string | null };
export type BankItem = { id: string; hub: string; body: string };

/** Integrity events for the slot: Supabase Realtime, with a 5-second poll behind it (RLS limits a reviewer to their candidates). */
function useSlotEvents(slotId: string, initial: IntegrityEvent[]) {
  const [events, setEvents] = useState(initial);
  const lastId = useRef(initial.reduce((m, e) => Math.max(m, e.id), 0));
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
    const timer = window.setInterval(poll, 5000);
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
  }, [slotId]);
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

/**
 * The interview panel for one slot: the call (owner token), a live integrity
 * sidebar per candidate, each candidate's summary and scoring (rendered on
 * the server, passed in as `details`), and, for admins, the question bank.
 * Signals are for the panel's judgement: they show what happened, not why.
 *
 * `dayMode`: the sidebar of the day room (the call is the day's, in
 * DayRoomShell); who is in the room comes from there.
 */
export function PanelRoom({
  slotId,
  role,
  people,
  details,
  initialEvents,
  bank,
  initialRevealed,
  phoneSetting,
  roomEnabled,
  dayMode = false,
  slotStartsAt,
}: {
  slotId: string;
  role: "admin" | "reviewer";
  people: PanelPerson[];
  details: Record<string, React.ReactNode>;
  initialEvents: IntegrityEvent[];
  bank: BankItem[];
  initialRevealed: string[];
  phoneSetting: PhoneCameraSetting;
  roomEnabled: boolean;
  dayMode?: boolean;
  slotStartsAt?: string;
}) {
  const day = useDayPresence();
  const events = useSlotEvents(slotId, initialEvents);
  const [selected, setSelected] = useState(people[0]?.booking_id ?? "");
  const [joined, setJoined] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState("");
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(new Set(initialRevealed));
  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(null);
  // Another panel member may reveal or hide too.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const list = await revealedIds(slotId).catch(() => null);
      if (list) setRevealed(new Set(list));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slotId]);

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

  const person = people.find((p) => p.booking_id === selected);
  const mine = byPerson[selected] ?? [];

  /** Day room: in the room now, left, or not joined yet (highlighted from 5 minutes into the slot, to mark a no-show). */
  const roomState = (p: PanelPerson): { label: string; tone: "good" | "neutral" | "bad" } | null => {
    if (!dayMode || !day) return null;
    if (day.present.has(p.booking_id)) return { label: "In the room", tone: "good" };
    if (day.seen.has(p.booking_id)) return { label: "Left the room", tone: "neutral" };
    const late = slotStartsAt && day.now !== null && day.now > new Date(slotStartsAt).getTime() + 5 * 60_000;
    return late && p.status === "booked" ? { label: "Not joined yet", tone: "bad" } : { label: "Not in the room yet", tone: "neutral" };
  };

  return (
    <div className={cn("grid gap-6", !dayMode && "xl:grid-cols-[minmax(0,1fr)_26rem]")}>
      <div className={cn("min-w-0 space-y-4", dayMode && "order-last")}>
        {!dayMode && (
        <div className="relative aspect-video w-full bg-black">
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
              />
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
        )}

        {role === "admin" && bank.length > 0 && (
          <section aria-labelledby="bank-title" className="border border-line bg-surface p-5">
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
        )}
      </div>

      <aside aria-label="Candidates" className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Candidates in this slot">
          {people.map((p) => {
            const flags = (byPerson[p.booking_id] ?? []).filter((e) => FLAG_TYPES.includes(e.type as IntegrityType)).length;
            const missing = roomState(p)?.tone === "bad";
            return (
              <button
                key={p.booking_id}
                type="button"
                role="tab"
                aria-selected={p.booking_id === selected}
                onClick={() => setSelected(p.booking_id)}
                className={cn(
                  "border px-3 py-1.5 text-left text-sm",
                  p.booking_id === selected ? "border-accent bg-accent text-white" : "border-ink/25 text-ink hover:border-ink/60",
                  missing && p.booking_id !== selected && "border-dashed border-accent",
                )}
              >
                {p.name}
                {flags > 0 && <span className="ml-1.5 tabular-nums">({flags})</span>}
                {missing && <span className="ml-1.5 text-xs">· not joined</span>}
              </button>
            );
          })}
        </div>

        {person ? (
          <div className="space-y-4">
            <div className="border border-line bg-surface p-5">
              <h2 className="font-serif text-lg text-ink">{person.name}</h2>
              <p className="mt-1 text-xs text-ink/70">{person.hubs}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={person.status === "attended" ? "good" : person.status === "no_show" ? "bad" : "neutral"}>
                  {person.status === "attended" ? "Attended" : person.status === "no_show" ? "No-show" : "Booked"}
                </Pill>
                {person.consented_at ? <Pill tone="good">Agreed to the rules {slotTime(person.consented_at)}</Pill> : !dayMode && <Pill tone="warn">Not joined yet</Pill>}
                {(() => {
                  const s = roomState(person);
                  return s && <Pill tone={s.tone}>{s.label}</Pill>;
                })()}
                {phoneSetting !== "off" &&
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
              <h3 className="mt-5 text-sm font-semibold text-ink">Integrity</h3>
              <p className="mb-2 text-xs text-ink/65">Signals to help the panel judge. They show what happened, not why.</p>
              <Summary events={mine} />
              {mine.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-ink/75">Timeline ({mine.length})</summary>
                  <ol className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs" aria-live="polite">
                    {[...mine].reverse().map((e) => (
                      <li key={e.id} className="flex gap-3">
                        <span className="w-16 shrink-0 tabular-nums text-ink/65">{slotTime(e.occurred_at)}</span>
                        <span className="text-ink">{EVENT_LABELS[e.type] ?? e.type}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            {details[person.booking_id]}
          </div>
        ) : (
          <p className="text-sm text-ink/70">No candidates in this slot.</p>
        )}
      </aside>
    </div>
  );
}
