"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { checkMeetingEmails, searchMeetingPeople, type MeetingInput, type MeetingPerson } from "@/actions/admin-meetings";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { cn, memberDetail } from "@/lib/utils";
import { MemberAvatar } from "./core-team-dialogs";
import { Pill } from "./ui";

export type Audience = MeetingInput["audience"][number];
export type PickerMember = {
  /** Someone from a website section of Core. */
  org_id?: string;
  user_id: string | null;
  /** Only for someone with no account yet. */
  email?: string | null;
  name: string;
  avatar_url: string | null;
  title: string | null;
  department: string | null;
  year: string | null;
  lead?: boolean;
};
export type PickerGroup = { kind: "core_group" | "org_category" | "role" | "team"; id: string; name: string; always: boolean; members: PickerMember[] };
export type Choices = { groups: PickerGroup[] };
export type Person = { id: string; name: string };
/** An address typed by an admin. `user`: it already has an account, so it will be an ordinary invite. */
export type EmailEntry = { email: string; user?: Person };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_LIMIT = 200;
const keyOf = (m: PickerMember) => m.user_id ?? (m.email ? `email:${m.email}` : null);
const invitable = (g: PickerGroup) => g.members.filter((m) => keyOf(m) !== null);

/** Name or email, as you type; the admin never types anything about the person. */
export function PersonSearch({ placeholder, onPick, exclude }: { placeholder: string; onPick: (p: Person) => void; exclude: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MeetingPerson[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const change = (next: string) => {
    setQ(next);
    if (timer.current) clearTimeout(timer.current);
    const ask = ++latest.current;
    if (next.trim().length < 2) return setResults(null);
    timer.current = setTimeout(async () => {
      const found = await searchMeetingPeople(next.trim());
      if (ask === latest.current) setResults(found.results);
    }, 300);
  };
  const shown = results?.filter((r) => !exclude.includes(r.id)) ?? null;
  return (
    <div className="relative">
      <Input type="search" value={q} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
      {shown && (
        <ul className="absolute inset-x-0 top-full z-20 max-h-56 overflow-y-auto border border-line bg-paper shadow-lg">
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink/70">Not found. You can invite them by email below.</li>}
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
                onClick={() => {
                  onPick({ id: r.id, name: r.full_name });
                  setQ("");
                  setResults(null);
                }}
              >
                <span className="font-medium text-ink">{r.full_name}</span>
                <span className="block text-xs text-ink/65">{r.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const chip = "inline-flex items-center gap-1.5 border border-line bg-paper px-2 py-1 text-sm text-ink";

function GroupRow({
  group,
  state,
  count,
  isOn,
  coveredBy,
  onGroup,
  onMember,
}: {
  group: PickerGroup;
  state: "all" | "some" | "none";
  count: string;
  isOn: (m: PickerMember) => boolean;
  coveredBy: (m: PickerMember) => string | undefined;
  onGroup: (on: boolean) => void;
  onMember: (m: PickerMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? group.members.filter((m) => `${m.name} ${m.title ?? ""} ${m.email ?? ""}`.toLowerCase().includes(needle)) : group.members;
  return (
    <div className="border-b border-line last:border-b-0" data-group={group.name}>
      <div className="flex items-center gap-2 px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={state === "all"}
            ref={(el) => {
              if (el) el.indeterminate = state === "some";
            }}
            onChange={() => onGroup(state !== "all")}
            className="h-4 w-4 shrink-0 accent-accent"
          />
          <span className="min-w-0">{group.name}</span>
        </label>
        <span className="shrink-0 text-xs text-ink/60 tabular-nums" data-count>
          {count}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Show the members of ${group.name}`} className="shrink-0 rounded-sm p-1 text-ink/65 hover:bg-ink/5">
          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-paper px-3 py-2">
          {group.members.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {group.members.length > 6 && (
                <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this list" aria-label={`Search ${group.name}`} className="h-8 min-w-0 flex-1 py-1 text-sm" autoComplete="off" />
              )}
              {!group.always && (
                <>
                  <Button type="button" variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => onGroup(true)}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="px-2 py-1 text-xs" onClick={() => onGroup(false)}>
                    Clear
                  </Button>
                </>
              )}
            </div>
          )}
          {group.members.length === 0 && <p className="py-1 text-sm text-ink/60">Nobody here yet. If you tick this group, anyone added before the start gets a pass.</p>}
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {shown.map((m) => {
              const key = keyOf(m);
              const covered = coveredBy(m);
              const locked = group.always || key === null || Boolean(covered);
              const offSite = !m.user_id;
              return (
                <li key={m.org_id ?? m.user_id ?? m.name} data-member={m.name}>
                  <label className={cn("flex items-center gap-2.5 py-1.5 text-sm", offSite && "text-ink/60")} title={covered ? `Invited with ${covered}` : undefined}>
                    <input type="checkbox" checked={group.always || isOn(m)} disabled={locked} onChange={() => onMember(m)} className="h-4 w-4 shrink-0 accent-accent" />
                    <MemberAvatar name={m.name} url={m.avatar_url} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
                        <span className={cn(offSite && "text-ink/60")}>{m.name}</span>
                        {m.lead && <Pill tone="good">Lead</Pill>}
                        {offSite && (
                          <Pill tone="warn">
                            <span className="normal-case">Not on the website yet</span>
                          </Pill>
                        )}
                      </span>
                      <span className="block text-xs text-ink/65">{[m.title, memberDetail(m), m.email].filter(Boolean).join(" · ")}</span>
                      {key === null && (
                        <span className="block text-xs text-ink/65">
                          Add their email or link their account to invite them.{" "}
                          {m.org_id && (
                            <a href={`/admin/team/${m.org_id}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                              Edit
                            </a>
                          )}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
            {needle && shown.length === 0 && <li className="py-1.5 text-sm text-ink/60">No one matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Type or paste one or many addresses. A registered one becomes a normal invite when saved. */
function EmailBox({ emails, setEmails, hidden }: { emails: EmailEntry[]; setEmails: (next: EmailEntry[]) => void; hidden: Set<string> }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState<{ text: string; reason: string }[]>([]);
  const [problem, setProblem] = useState("");
  const [pending, startTransition] = useTransition();
  const add = () => {
    const parts = [...new Set(text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean))];
    const wrong = parts.filter((p) => !EMAIL.test(p) || p.length > 254).map((p) => ({ text: p, reason: "Not a valid email address" }));
    const known = new Set(emails.map((e) => e.email));
    const fresh = parts.filter((p) => EMAIL.test(p) && p.length <= 254 && !known.has(p));
    const room = EMAIL_LIMIT - emails.length;
    const taken = fresh.slice(0, Math.max(0, room));
    const over = fresh.slice(Math.max(0, room)).map((p) => ({ text: p, reason: `At most ${EMAIL_LIMIT} per meeting` }));
    setProblem("");
    setBad([...wrong, ...over]);
    setText("");
    if (taken.length === 0) return;
    startTransition(async () => {
      const found = await checkMeetingEmails(taken);
      if (found.error) setProblem(found.error);
      setEmails([...emails, ...taken.map((email) => ({ email, user: found.users.find((u) => u.email === email)?.user }))]);
    });
  };
  const shown = emails.filter((e) => !hidden.has(e.email));
  return (
    <div>
      <Label htmlFor="meeting-emails">Invite by email</Label>
      <div className="flex items-start gap-2">
        <Textarea id="meeting-emails" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Type or paste emails, separated by commas, spaces or new lines" className="min-w-0 flex-1" />
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={add}>
          Add
        </Button>
      </div>
      <FieldHint>Someone with an account gets a pass at once. Anyone else gets an email and has their pass once they sign up with that address.</FieldHint>
      {problem && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {problem}
        </p>
      )}
      {(shown.length > 0 || bad.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-emails>
          {shown.map((e) => (
            <span key={e.email} className={chip} data-email={e.email}>
              {e.email}
              <span className="text-xs text-ink/60">{e.user ? `Has an account: ${e.user.name}` : "Will get a sign-up email"}</span>
              <button type="button" aria-label={`Remove ${e.email}`} onClick={() => setEmails(emails.filter((x) => x.email !== e.email))}>
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
          {bad.map((b) => (
            <span key={b.text} className="inline-flex items-center gap-1.5 border border-red-500/60 bg-red-500/10 px-2 py-1 text-sm text-red-600" data-bad-email={b.text}>
              {b.text}
              <span className="text-xs">{b.reason}</span>
              <button type="button" aria-label={`Remove ${b.text}`} onClick={() => setBad(bad.filter((x) => x.text !== b.text))}>
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Who a meeting is for. A ticked group is stored as the group, so people added to it later
 * get a pass too; a group with only some members ticked stores just those people. Everything
 * here counts one person once, whichever groups they are in.
 */
export function AudiencePicker({
  value,
  onChange,
  emails,
  setEmails,
  people,
  setPeople,
  choices,
  alsoInvited = [],
}: {
  value: Audience[];
  onChange: (next: Audience[]) => void;
  emails: EmailEntry[];
  setEmails: (next: EmailEntry[]) => void;
  people: Person[];
  setPeople: (next: Person[]) => void;
  choices: Choices;
  /** Co-hosts, and those who already became accounts: they get a pass whatever is ticked. */
  alsoInvited?: Person[];
}) {
  const [listing, setListing] = useState(false);
  const stored = (g: PickerGroup) => value.some((a) => a.kind === g.kind && a.id === g.id);
  const storedGroups = choices.groups.filter(stored);
  const memberEmails = useMemo(() => new Set(choices.groups.flatMap((g) => g.members.flatMap((m) => (m.email ? [m.email] : [])))), [choices.groups]);
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const g of choices.groups) for (const m of g.members) if (m.user_id) out.set(m.user_id, m.name);
    return out;
  }, [choices.groups]);

  const covered = new Map<string, string>();
  for (const g of storedGroups) for (const m of invitable(g)) covered.set(keyOf(m) as string, g.name);
  const selected = new Set(covered.keys());
  for (const a of value) if (a.kind === "person") selected.add(a.id);
  for (const e of emails) selected.add(e.user ? e.user.id : `email:${e.email}`);

  const isOn = (m: PickerMember) => selected.has(keyOf(m) ?? "");
  const coveredOutside = (g: PickerGroup, m: PickerMember) => storedGroups.find((h) => h !== g && invitable(h).some((x) => keyOf(x) === keyOf(m)))?.name;

  const withoutKeys = (keys: Set<string>) => ({
    value: value.filter((a) => !(a.kind === "person" && keys.has(a.id))),
    emails: emails.filter((e) => !keys.has(`email:${e.email}`) && !(e.user && keys.has(e.user.id))),
    people: people.filter((p) => !keys.has(p.id)),
  });
  const write = (next: { value: Audience[]; emails: EmailEntry[]; people: Person[] }) => {
    onChange(next.value);
    setEmails(next.emails);
    setPeople(next.people);
  };

  const setGroup = (g: PickerGroup, on: boolean) => {
    const next = withoutKeys(new Set(invitable(g).map((m) => keyOf(m) as string)));
    const rest = next.value.filter((a) => !(a.kind === g.kind && a.id === g.id));
    write({ ...next, value: on ? [...rest, { kind: g.kind, id: g.id } as Audience] : rest });
  };

  const toggleMember = (g: PickerGroup, m: PickerMember) => {
    const key = keyOf(m) as string;
    if (selected.has(key)) {
      const next = withoutKeys(new Set([key]));
      if (!stored(g)) return write(next);
      // The group was ticked: it stops being the group, and everyone else stays, one by one.
      const others = invitable(g).filter((x) => keyOf(x) !== key && !coveredOutside(g, x));
      write({
        ...next,
        value: [...next.value.filter((a) => !(a.kind === g.kind && a.id === g.id)), ...others.flatMap((x) => (x.user_id ? [{ kind: "person", id: x.user_id } as Audience] : []))],
        emails: [...next.emails, ...others.flatMap((x) => (!x.user_id && x.email ? [{ email: x.email }] : []))],
      });
      return;
    }
    if (invitable(g).every((x) => keyOf(x) === key || selected.has(keyOf(x) as string))) return setGroup(g, true);
    if (m.user_id) onChange([...value, { kind: "person", id: m.user_id }]);
    else if (m.email) setEmails([...emails, { email: m.email }]);
  };

  // Who will get a pass, each person once.
  const list = new Map<string, { name: string; byEmail: boolean }>();
  const addPerson = (id: string, name: string) => list.set(id, { name, byEmail: false });
  const addEntry = (id: string | null, email: string, name: string) => {
    if (id) addPerson(id, name);
    else list.set(`email:${email}`, { name: email, byEmail: true });
  };
  for (const g of choices.groups) if (g.always) for (const m of g.members) if (m.user_id) addPerson(m.user_id, m.name);
  for (const g of storedGroups) for (const m of invitable(g)) addEntry(m.user_id, m.email ?? "", m.name);
  for (const p of people) addPerson(p.id, p.name);
  for (const a of value) if (a.kind === "person" && !list.has(a.id)) addPerson(a.id, names.get(a.id) ?? "Person");
  for (const p of alsoInvited) addPerson(p.id, p.name);
  for (const e of emails) addEntry(e.user?.id ?? null, e.email, e.user?.name ?? e.email);
  const everyone = [...list.values()].sort((a, b) => a.name.localeCompare(b.name));
  const byEmail = everyone.filter((p) => p.byEmail).length;

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium text-ink">Who is it for</legend>
      {choices.groups.length === 0 && (
        <p role="alert" className="text-sm text-red-600">
          The groups could not be loaded. If migration 0033 has not been run yet, run it and reload.
        </p>
      )}
      <div className="max-h-[30rem] overflow-y-auto border border-line">
        {choices.groups.map((g) => {
          const can = invitable(g);
          const on = can.filter(isOn).length;
          const state = stored(g) || (can.length > 0 && on === can.length) ? "all" : on > 0 ? "some" : "none";
          return (
            <GroupRow
              key={`${g.kind}-${g.id}`}
              group={g}
              state={state}
              count={g.always ? `${can.length} always invited` : `${on} of ${can.length} selected`}
              isOn={isOn}
              coveredBy={(m) => coveredOutside(g, m)}
              onGroup={(next) => setGroup(g, next)}
              onMember={(m) => toggleMember(g, m)}
            />
          );
        })}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Specific people</p>
        <PersonSearch
          placeholder="Search people by name or email"
          exclude={[...selected]}
          onPick={(p) => {
            setPeople([...people, p]);
            onChange([...value, { kind: "person", id: p.id }]);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <span key={p.id} className={chip}>
              {p.name}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => {
                  setPeople(people.filter((x) => x.id !== p.id));
                  onChange(value.filter((a) => !(a.kind === "person" && a.id === p.id)));
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>
      <EmailBox emails={emails} setEmails={setEmails} hidden={memberEmails} />
      <div className="border border-line bg-paper px-3 py-2 text-sm text-ink" data-summary>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            Inviting {everyone.length} {everyone.length === 1 ? "person" : "people"}
            {byEmail > 0 && ` (${byEmail} by email)`}
          </p>
          <button type="button" className="text-sm underline underline-offset-2" aria-expanded={listing} onClick={() => setListing((v) => !v)}>
            {listing ? "Hide list" : "View list"}
          </button>
        </div>
        {listing && (
          <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto" data-summary-list>
            {everyone.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 break-all">{p.name}</span>
                {p.byEmail && <span className="shrink-0 text-xs text-ink/60">By email</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FieldHint>Every admin always gets a pass too. Leads of a whole ticked team become co-hosts by themselves.</FieldHint>
    </fieldset>
  );
}
