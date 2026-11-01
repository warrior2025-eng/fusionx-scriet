"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2, X, Zap } from "lucide-react";
import { saveMeeting, startInstantMeeting } from "@/actions/admin-meetings";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { AudiencePicker, PersonSearch, chip, type Audience, type Choices, type EmailEntry, type Person } from "./meeting-audience";
import { toastResult } from "./toast";

export type { Choices } from "./meeting-audience";
export type MeetingDraft = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_min: number;
  lobby_on: boolean;
  join_muted: boolean;
  join_camera_off: boolean | null;
  screen_share_all: boolean;
  chat_on: boolean;
  audience: { kind: Audience["kind"]; id: string; label: string | null }[];
  cohosts: { id: string; name: string }[];
  agenda: { title: string; minutes: number | null }[];
  emails: { id: string; email: string; source: "manual" | "group"; can_resend: boolean; user_id: string | null; name: string | null; status: "waiting" | "pass" | "joined" }[];
};

const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istClock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

/** Create or edit a meeting. Date and time are always IST. */
export function MeetingForm({ meeting, choices, preselectTeam }: { meeting?: MeetingDraft; choices: Choices; preselectTeam?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [date, setDate] = useState(meeting ? istDate(meeting.starts_at) : "");
  const [time, setTime] = useState(meeting ? istClock(meeting.starts_at) : "");
  const [duration, setDuration] = useState(meeting?.duration_min ?? 60);
  const [audience, setAudience] = useState<Audience[]>(
    meeting ? meeting.audience.map((a) => ({ kind: a.kind, id: a.id }) as Audience) : preselectTeam ? [{ kind: "core_group", id: preselectTeam }] : [],
  );
  const [people, setPeople] = useState<Person[]>(() => {
    // Someone ticked inside a group shows there; only the others are listed by name.
    const inGroups = new Set(choices.groups.flatMap((g) => g.members.map((m) => m.user_id)));
    return meeting?.audience.filter((a) => a.kind === "person" && !inGroups.has(a.id)).map((a) => ({ id: a.id, name: a.label ?? "Person" })) ?? [];
  });
  const [emails, setEmails] = useState<EmailEntry[]>(meeting?.emails?.filter((e) => e.source === "manual" && !e.user_id).map((e) => ({ email: e.email })) ?? []);
  const accepted = meeting?.emails?.flatMap((e) => (e.user_id ? [{ id: e.user_id, name: e.name ?? e.email }] : [])) ?? [];
  const [cohosts, setCohosts] = useState<Person[]>(meeting?.cohosts ?? []);
  const [agenda, setAgenda] = useState(meeting?.agenda.map((a) => ({ title: a.title, minutes: a.minutes ? String(a.minutes) : "" })) ?? []);
  const [lobby, setLobby] = useState(meeting?.lobby_on ?? false);
  const [muted, setMuted] = useState(meeting?.join_muted ?? true);
  const [camera, setCamera] = useState(meeting?.join_camera_off === null || meeting?.join_camera_off === undefined ? "auto" : meeting.join_camera_off ? "on" : "off");
  const [share, setShare] = useState(meeting?.screen_share_all ?? true);
  const [chat, setChat] = useState(meeting?.chat_on ?? true);
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();

  const moveItem = (i: number, by: number) =>
    setAgenda((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem("");
    if (!date || !time) return setProblem("Choose the date and start time.");
    startTransition(async () => {
      const result = await saveMeeting(meeting?.id ?? null, {
        title,
        description,
        starts_at: `${date}T${time}:00+05:30`,
        duration_min: Number(duration),
        audience,
        emails: emails.map((e) => e.email),
        cohosts: cohosts.map((c) => c.id),
        agenda: agenda.filter((a) => a.title.trim()).map((a) => ({ title: a.title, minutes: a.minutes ? Number(a.minutes) : null })),
        lobby_on: lobby,
        join_muted: muted,
        join_camera_off: camera === "auto" ? null : camera === "on",
        screen_share_all: share,
        chat_on: chat,
        repeat_weeks: !meeting && repeat ? weeks : 1,
      });
      toastResult(result);
      if (result.status !== "success") return setProblem(result.message ?? "Please check the form.");
      router.push(result.redirectTo ?? "/admin/meetings");
      router.refresh();
    });
  };
  const option = (checked: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div>
        <Label htmlFor="meeting-title">Title</Label>
        <Input id="meeting-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoComplete="off" />
      </div>
      <div>
        <Label htmlFor="meeting-about">Description (optional)</Label>
        <Textarea id="meeting-about" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="meeting-date">Date</Label>
          <Input id="meeting-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="meeting-time">Start time (IST)</Label>
          <Input id="meeting-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="meeting-duration">Duration (15 to 180 min)</Label>
          <Input id="meeting-duration" type="number" min={15} max={180} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
      </div>

      <AudiencePicker value={audience} onChange={setAudience} emails={emails} setEmails={setEmails} choices={choices} people={people} setPeople={setPeople} alsoInvited={[...cohosts, ...accepted]} />

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Co-hosts (optional)</p>
        <PersonSearch placeholder="Search co-hosts by name or email" exclude={cohosts.map((c) => c.id)} onPick={(p) => setCohosts([...cohosts, p])} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cohosts.map((c) => (
            <span key={c.id} className={chip}>
              {c.name}
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => setCohosts(cohosts.filter((x) => x.id !== c.id))}>
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Agenda (optional)</legend>
        <ol className="space-y-2">
          {agenda.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-ink/60">{i + 1}.</span>
              <Input
                value={item.title}
                maxLength={200}
                aria-label={`Agenda item ${i + 1}`}
                placeholder="What to discuss"
                onChange={(e) => setAgenda((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <Input
                type="number"
                min={1}
                max={180}
                value={item.minutes}
                aria-label={`Minutes for item ${i + 1}`}
                placeholder="min"
                className="w-20 shrink-0"
                onChange={(e) => setAgenda((list) => list.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))}
              />
              <button type="button" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => moveItem(i, -1)} className="text-ink/65 disabled:opacity-30">
                <ChevronUp size={16} aria-hidden />
              </button>
              <button type="button" aria-label={`Move item ${i + 1} down`} disabled={i === agenda.length - 1} onClick={() => moveItem(i, 1)} className="text-ink/65 disabled:opacity-30">
                <ChevronDown size={16} aria-hidden />
              </button>
              <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setAgenda((list) => list.filter((_, j) => j !== i))} className="text-ink/65 hover:text-red-600">
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setAgenda((list) => [...list, { title: "", minutes: "" }])}>
          <Plus size={14} aria-hidden /> Add an item
        </Button>
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">Options</legend>
        {option(lobby, setLobby, "Waiting lobby for invitees (people who knock always wait)")}
        {option(muted, setMuted, "Everyone joins muted")}
        <label className="block text-sm text-ink">
          Everyone joins with camera off
          <Select value={camera} onChange={(e) => setCamera(e.target.value)} className="mt-1 sm:w-80">
            <option value="auto">Automatic: on when 15 or more are invited</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </Select>
        </label>
        {option(share, setShare, "Screen share for everyone (off: hosts only)")}
        {option(chat, setChat, "Chat")}
        {!meeting && (
          <div className="flex flex-wrap items-center gap-2">
            {option(repeat, setRepeat, "Repeat weekly for")}
            <Input type="number" min={2} max={26} value={weeks} disabled={!repeat} aria-label="Number of weeks" className="w-20" onChange={(e) => setWeeks(Number(e.target.value))} />
            <span className="text-sm text-ink">weeks</span>
          </div>
        )}
      </fieldset>

      {problem && (
        <p role="alert" className="border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button type="submit" loading={pending}>
          {meeting ? "Save changes" : "Create meeting"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/meetings")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** "Start an instant meeting": a title and an audience, starts now, invitees get a ring. */
export function InstantMeetingButton({ choices }: { choices: Choices }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<Audience[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();
  const start = () => {
    setProblem("");
    startTransition(async () => {
      const result = await startInstantMeeting({ title, audience, emails: emails.map((e) => e.email) });
      toastResult(result);
      if (result.status !== "success") return setProblem(result.message ?? "Please check the form.");
      dialogRef.current?.close();
      if (result.redirectTo) router.push(result.redirectTo);
    });
  };
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.showModal()}>
        <Zap size={15} aria-hidden /> Start an instant meeting
      </Button>
      <dialog ref={dialogRef} aria-label="Start an instant meeting" className="m-auto w-[min(92vw,36rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60">
        <h2 className="font-serif text-xl">Start an instant meeting</h2>
        <p className="mt-1 text-sm text-ink/70">It starts now, and everyone invited gets a ring.</p>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="instant-title">Title</Label>
            <Input id="instant-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoComplete="off" />
          </div>
          <AudiencePicker value={audience} onChange={setAudience} emails={emails} setEmails={setEmails} choices={choices} people={people} setPeople={setPeople} />
          {problem && (
            <p role="alert" className="text-sm text-red-600">
              {problem}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
          <Button type="button" size="sm" loading={pending} onClick={start}>
            Start and call them
          </Button>
        </div>
      </dialog>
    </>
  );
}
