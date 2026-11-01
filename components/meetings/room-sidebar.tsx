"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hand, Mic, MicOff, MoreHorizontal, PhoneCall, Trash2, Video, VideoOff, X } from "lucide-react";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { createClient } from "@/lib/supabase/client";
import { HOST_REMOVABLE, hostBadge, linkParts, type RoomPerson, type RoomState } from "@/lib/meetings/shared";
import { cn } from "@/lib/utils";

export type LiveInfo = Record<string, { mic: boolean; camera: boolean; quality: "good" | "poor" | "lost" | "unknown" }>;
export type Tab = "people" | "chat" | "agenda" | "notes";
export type RoomApi = {
  meetingId: string;
  state: RoomState;
  live: LiveInfo;
  host: (action: string, args?: Record<string, unknown>) => Promise<string | null>;
  /** A host action, with the reason shown if it is refused. */
  act: (action: string, args?: Record<string, unknown>) => void;
  confirm: (title: string, body: string, confirmLabel: string, run: () => void) => void;
  toast: (message: string) => void;
  nudge: () => void;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "people", label: "People" },
  { key: "chat", label: "Chat" },
  { key: "agenda", label: "Agenda" },
  { key: "notes", label: "Notes" },
];

export function Avatar({ person, className }: { person: Pick<RoomPerson, "name" | "avatar_url">; className?: string }) {
  if (person.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element -- can be a Google or GitHub picture
    return <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" className={cn("shrink-0 rounded-full object-cover ring-1 ring-accent", className ?? "h-8 w-8")} />;
  }
  return <InitialsAvatar name={person.name} className={className ?? "h-8 w-8 text-xs"} />;
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" }) {
  return <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-semibold", tone === "accent" ? "bg-accent text-white" : "border border-ink/25 text-ink/80")}>{children}</span>;
}

/** What a host can do to one person: the same menu in People and on a tile. */
export function PersonMenu({ person, api, onDone, className }: { person: RoomPerson; api: RoomApi; onDone?: () => void; className?: string }) {
  const kind = person.host_kind;
  const item = "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink/5";
  const run = (fn: () => void) => {
    fn();
    onDone?.();
  };
  return (
    <div className={cn("min-w-44 border border-line bg-paper py-1 shadow-lg", className)} role="menu" aria-label={`Host actions for ${person.name}`}>
      {!kind && (
        <button type="button" role="menuitem" className={item} onClick={() => run(() => api.act("make_cohost", { user: person.id }))}>
          Make co-host
        </button>
      )}
      {HOST_REMOVABLE(kind) && (
        <button type="button" role="menuitem" className={item} onClick={() => run(() => api.act("remove_cohost", { user: person.id }))}>
          Remove co-host
        </button>
      )}
      {person.in_room && (
        <button type="button" role="menuitem" className={item} onClick={() => run(() => api.act("mute_person", { user: person.id }))}>
          Mute
        </button>
      )}
      {person.hand && (
        <button type="button" role="menuitem" className={item} onClick={() => run(() => api.act("lower_hand", { user: person.id }))}>
          Lower hand
        </button>
      )}
      {person.in_room && kind !== "creator" && kind !== "admin" && (
        <button
          type="button"
          role="menuitem"
          className={cn(item, "text-red-600")}
          onClick={() =>
            run(() =>
              api.confirm("Remove from the meeting?", `${person.name} will be taken out and cannot come back to this meeting.`, "Remove", () => api.act("remove_person", { user: person.id })),
            )
          }
        >
          Remove from meeting
        </button>
      )}
    </div>
  );
}

function PersonRow({ person, api, handOrder }: { person: RoomPerson; api: RoomApi; handOrder?: number }) {
  const [open, setOpen] = useState(false);
  const live = api.live[person.id];
  const isHost = api.state.me.is_host;
  const self = person.id === api.state.me.id;
  const badge = hostBadge(person.host_kind);
  const dot = live?.quality === "poor" ? "bg-amber-500" : live?.quality === "lost" ? "bg-red-500" : "bg-emerald-500";
  return (
    <li className="relative flex items-center gap-2.5 py-2" data-person={person.name}>
      <Avatar person={person} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
          <span className="truncate">{person.name}</span>
          {self && <span className="text-xs font-normal text-ink/60">(you)</span>}
          {badge && <Badge tone="accent">{badge}</Badge>}
          {person.seat.lead && <Badge>Lead</Badge>}
        </p>
        <p className="truncate text-xs text-ink/65">{person.seat.primary}</p>
        {person.seat.teams.length > 1 && (
          <p className="mt-0.5 flex flex-wrap gap-1">
            {person.seat.teams.slice(1).map((team) => (
              <span key={team.name} title={team.label} className="rounded-sm border border-line px-1 py-px text-[10px] text-ink/70">
                {team.name}
              </span>
            ))}
          </p>
        )}
        {person.cant && <p className="text-xs text-ink/70">Can&rsquo;t make it: {person.cant}</p>}
        {!person.in_room && !person.cant && person.ring_answer === "cant" && <p className="text-xs text-ink/70">Answered the ring: can&rsquo;t join</p>}
      </div>
      {person.hand && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent-text" title="Hand raised">
          <Hand size={13} aria-hidden /> {handOrder}
          <span className="sr-only">Hand raised, number {handOrder}</span>
        </span>
      )}
      {person.in_room && live && (
        <span className="flex items-center gap-1 text-ink/60">
          {live.mic ? <Mic size={14} aria-label="Microphone on" /> : <MicOff size={14} aria-label="Muted" />}
          {live.camera ? <Video size={14} aria-label="Camera on" /> : <VideoOff size={14} aria-label="Camera off" />}
          <span className={cn("h-2 w-2 rounded-full", dot)} title={`Connection: ${live.quality}`} aria-label={`Connection: ${live.quality}`} />
        </span>
      )}
      {isHost && !person.in_room && !self && (
        <Button type="button" variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => api.act("ring", { user: person.id })}>
          <PhoneCall size={12} aria-hidden /> Ring
        </Button>
      )}
      {isHost && !self && (
        <div className="relative">
          <button type="button" aria-label={`More for ${person.name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-sm p-1 text-ink/65 hover:bg-ink/5 hover:text-ink">
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {open && <PersonMenu person={person} api={api} onDone={() => setOpen(false)} className="absolute right-0 top-full z-20" />}
        </div>
      )}
    </li>
  );
}

function PeopleTab({ api }: { api: RoomApi }) {
  const { state } = api;
  const hands = useMemo(() => state.people.filter((p) => p.hand).sort((a, b) => (a.hand ?? "").localeCompare(b.hand ?? "")), [state.people]);
  const order = (p: RoomPerson) => hands.findIndex((h) => h.id === p.id) + 1;
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; order: number; people: RoomPerson[] }>();
    for (const p of state.people) {
      const g = map.get(p.seat.group) ?? { name: p.seat.group, order: p.seat.order, people: [] };
      g.people.push(p);
      map.set(p.seat.group, g);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [state.people]);
  const notJoined = state.people.filter((p) => !p.in_room && p.id !== state.me.id).length;
  const part = (list: RoomPerson[], label: string, group: string) =>
    list.length > 0 && (
      <div key={`${group}-${label}`}>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink/55">
          {label} ({list.length})
        </p>
        <ul className="divide-y divide-line/60">
          {list.map((p) => (
            <PersonRow key={p.id} person={p} api={api} handOrder={order(p)} />
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-4">
      {state.me.is_host && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={notJoined === 0} onClick={() => api.act("ring")}>
            <PhoneCall size={13} aria-hidden /> Ring all not joined
          </Button>
          {hands.length > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={() => api.act("lower_hands")}>
              Lower all hands
            </Button>
          )}
        </div>
      )}
      {hands.length > 0 && (
        <section aria-label="Hands raised, in order">
          <h3 className="text-sm font-semibold text-ink">Hands raised</h3>
          <ol className="mt-1 space-y-1 text-sm text-ink/85">
            {hands.map((p, i) => (
              <li key={p.id}>
                {i + 1}. {p.name}
              </li>
            ))}
          </ol>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h3 className="text-sm font-semibold text-ink">{g.name}</h3>
          {part(g.people.filter((p) => p.in_room), "In the room", g.name)}
          {part(g.people.filter((p) => !p.in_room && !p.cant), "Not joined yet", g.name)}
          {part(g.people.filter((p) => !p.in_room && p.cant), "Can’t make it", g.name)}
        </section>
      ))}
    </div>
  );
}

function ChatTab({ api }: { api: RoomApi }) {
  const { state } = api;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const count = state.chat.length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await createClient().rpc("meeting_chat_send", { p_meeting: state.meeting.id, p_body: body });
    setSending(false);
    if (error) return api.toast(error.message);
    setText("");
    api.nudge();
  };
  if (!state.meeting.chat_on) return <p className="text-sm text-ink/70">Chat is off for this meeting.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {count === 0 && <li className="text-sm text-ink/60">No messages yet.</li>}
        {state.chat.map((m) => (
          <li key={m.id} className="group text-sm">
            <p className="text-xs text-ink/60">
              <span className="font-semibold text-ink/85">{m.name ?? "Someone"}</span> · {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
              {state.me.is_host && !m.deleted && (
                <button type="button" aria-label="Delete this message" onClick={() => api.act("chat_delete", { id: m.id })} className="ml-2 inline-flex align-middle text-ink/50 hover:text-red-600">
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </p>
            {m.deleted ? (
              <p className="italic text-ink/50">Message removed by a host</p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-ink">
                {linkParts(m.body ?? "").map((part, i) =>
                  part.href ? (
                    <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-text underline underline-offset-2">
                      {part.text}
                    </a>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </p>
            )}
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message everyone" aria-label="Message everyone" autoComplete="off" className="py-2" />
        <Button type="submit" size="sm" disabled={!text.trim()} loading={sending}>
          Send
        </Button>
      </form>
    </div>
  );
}

function AgendaTab({ api }: { api: RoomApi }) {
  const { state } = api;
  const { tick } = useServerClock(state.now);
  const current = state.meeting.current_agenda_id;
  const index = state.agenda.findIndex((a) => a.id === current);
  const next = state.agenda[index + 1];
  const startedAt = state.meeting.agenda_item_at ? new Date(state.meeting.agenda_item_at).getTime() : null;
  if (state.agenda.length === 0) return <p className="text-sm text-ink/70">This meeting has no agenda.</p>;
  return (
    <div>
      <ol className="space-y-2">
        {state.agenda.map((item, i) => {
          const active = item.id === current;
          const left = active && item.minutes && startedAt && tick ? startedAt + item.minutes * 60000 - tick : null;
          return (
            <li key={item.id} aria-current={active ? "step" : undefined} className={cn("border p-3 text-sm", active ? "border-accent bg-accent-soft" : "border-line")}>
              <p className="font-medium text-ink">
                {i + 1}. {item.title}
              </p>
              <p className="mt-0.5 text-xs text-ink/65">
                {item.minutes ? `${item.minutes} min` : "No set time"}
                {left !== null && <span className="ml-2 font-semibold text-ink">{left >= 0 ? `${countdownText(left)} left` : `${countdownText(-left)} over`}</span>}
              </p>
            </li>
          );
        })}
      </ol>
      {state.me.is_host && (
        <Button type="button" className="mt-3 w-full" size="sm" disabled={index >= 0 && !next} onClick={() => api.act("agenda", { id: (next ?? state.agenda[0]).id })}>
          {index < 0 ? "Start the first item" : next ? "Next item" : "This is the last item"}
        </Button>
      )}
    </div>
  );
}

function NotesTab({ api }: { api: RoomApi }) {
  const { state, host } = api;
  const isHost = state.me.is_host;
  const server = state.notes;
  const [body, setBody] = useState(server?.body ?? "");
  const [decisions, setDecisions] = useState<string[]>(server?.decisions ?? []);
  const [decision, setDecision] = useState("");
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty">("saved");
  const [seen, setSeen] = useState(server?.version ?? 0);
  const [task, setTask] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");

  // Someone else's edit arrives, unless there is unsaved typing here.
  if (server && server.version !== seen && saved === "saved") {
    setSeen(server.version);
    setBody(server.body);
    setDecisions(server.decisions);
  }

  useEffect(() => {
    if (saved !== "dirty") return;
    const timer = window.setTimeout(async () => {
      setSaved("saving");
      const problem = await host("set_notes", { body, decisions });
      if (problem) {
        api.toast(problem);
        setSaved("dirty");
      } else setSaved("saved");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [saved, body, decisions, host, api]);

  const addDecision = () => {
    const text = decision.trim();
    if (!text) return;
    setDecisions((d) => [...d, text]);
    setDecision("");
    setSaved("dirty");
  };
  const addAction = async () => {
    if (!task.trim()) return;
    const problem = await host("action_add", { task: task.trim(), user: owner || undefined, due_on: due });
    if (problem) return api.toast(problem);
    setTask("");
    setOwner("");
    setDue("");
  };
  const toggle = async (id: string, done: boolean) => {
    const { error } = await createClient().rpc("meeting_action_done", { p_item: id, p_done: done });
    if (error) api.toast(error.message);
    api.nudge();
  };
  const people = [...state.people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5 text-sm">
      <section aria-label="Notes">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">Notes</h3>
          {isHost && <span className="text-xs text-ink/60" role="status">{saved === "saved" ? "Saved" : "Saving…"}</span>}
        </div>
        {isHost ? (
          <Textarea
            value={body}
            maxLength={50000}
            rows={8}
            aria-label="Meeting notes"
            className="mt-2"
            onChange={(e) => {
              setBody(e.target.value);
              setSaved("dirty");
            }}
          />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-ink/85">{body || "Nothing written yet."}</p>
        )}
      </section>
      <section aria-label="Decisions">
        <h3 className="font-semibold text-ink">Decisions</h3>
        <ul className="mt-2 space-y-1.5">
          {decisions.length === 0 && <li className="text-ink/60">None yet.</li>}
          {decisions.map((d, i) => (
            <li key={`${i}-${d}`} className="flex items-start gap-2 text-ink">
              <span className="flex-1">{d}</span>
              {isHost && (
                <button
                  type="button"
                  aria-label={`Remove decision: ${d}`}
                  className="text-ink/50 hover:text-red-600"
                  onClick={() => {
                    setDecisions((all) => all.filter((_, j) => j !== i));
                    setSaved("dirty");
                  }}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addDecision();
            }}
          >
            <Input value={decision} onChange={(e) => setDecision(e.target.value)} maxLength={500} aria-label="New decision" placeholder="Add a decision" className="py-2" />
            <Button type="submit" variant="secondary" size="sm">
              Add
            </Button>
          </form>
        )}
      </section>
      <section aria-label="Action items">
        <h3 className="font-semibold text-ink">Action items</h3>
        <ul className="mt-2 space-y-2">
          {state.actions.length === 0 && <li className="text-ink/60">None yet.</li>}
          {state.actions.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-ink">
              {(isHost || a.owner_id === state.me.id) && (
                <input type="checkbox" checked={a.done} onChange={(e) => void toggle(a.id, e.target.checked)} aria-label={`Done: ${a.task}`} className="mt-0.5 h-4 w-4 accent-accent" />
              )}
              <span className="min-w-0 flex-1">
                <span className={a.done ? "line-through opacity-70" : ""}>{a.task}</span>
                <span className="block text-xs text-ink/60">
                  {a.owner ?? "No owner"}
                  {a.due_on ? ` · due ${a.due_on}` : ""}
                </span>
              </span>
              {isHost && (
                <button type="button" aria-label={`Delete: ${a.task}`} className="text-ink/50 hover:text-red-600" onClick={() => api.act("action_delete", { id: a.id })}>
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <form
            className="mt-3 space-y-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void addAction();
            }}
          >
            <Input value={task} onChange={(e) => setTask(e.target.value)} maxLength={300} aria-label="New task" placeholder="New task" className="py-2" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="py-2">
                <option value="">Owner</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="py-2" />
            </div>
            <Button type="submit" variant="secondary" size="sm" disabled={!task.trim()}>
              Add action item
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

/** People · Chat · Agenda · Notes, with its own scroll. */
export function RoomSidebar({ api, tab, onTab, onClose }: { api: RoomApi; tab: Tab; onTab: (tab: Tab) => void; onClose: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-ink">
      <div className="flex shrink-0 items-center border-b border-line" role="tablist" aria-label="Meeting panel">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={cn("flex-1 border-b-2 px-2 py-3 text-sm font-medium", tab === t.key ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink")}
          >
            {t.label}
            {t.key === "people" && <span className="ml-1 text-xs text-ink/60">{api.state.people.filter((p) => p.in_room).length}</span>}
          </button>
        ))}
        <button type="button" aria-label="Close the panel" onClick={onClose} className="shrink-0 p-3 text-ink/60 hover:text-ink">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 p-3.5", tab === "chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto")} role="tabpanel">
        {tab === "people" && <PeopleTab api={api} />}
        {tab === "chat" && <ChatTab api={api} />}
        {tab === "agenda" && <AgendaTab api={api} />}
        {/* Kept mounted so unsaved typing survives a look at another tab. */}
        <div className={tab === "notes" ? "" : "hidden"}>
          <NotesTab api={api} />
        </div>
      </div>
    </div>
  );
}
