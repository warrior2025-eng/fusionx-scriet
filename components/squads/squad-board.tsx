"use client";

import { useState } from "react";
import { Check, Sparkles, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useRun } from "@/components/autopilot/center-parts";
import { askToJoin, createSquad, inviteToSquad, joinPool, leavePool, leaveSquad, respondSquad, setSquad, squadFromPool } from "@/actions/squads";
import { cn } from "@/lib/utils";

/** Squad Match (migration 0047): find teammates by role. No codes: invites, requests and smart picks. */

type Person = { user_id: string; name: string; department: string | null; year: string | null; role?: string; skills?: string[]; avatar_url?: string | null; note?: string | null };
type Squad = {
  id: string; name: string; idea: string | null; status: "forming" | "full" | "registered"; size: number; size_max: number; lead_id: string;
  roles_needed: string[]; open_roles: string[]; members: (Person & { role: string; lead: boolean })[];
  pending: (Person & { role: string; state: "invited" | "asked" })[]; needs_me: boolean;
};
export type Board = {
  me: string; my_squad: string | null; my_pool_role: string | null; roles: string[]; squads: Squad[]; pool: Person[];
  picks: (Person & { for_role: string; score: number })[]; complements: Person[];
};

const STATUS: Record<Squad["status"], string> = { forming: "Forming", full: "Full", registered: "Registered ✓" };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const who = (p: Person) => [p.department, p.year].filter(Boolean).join(" · ");

function Avatar({ p }: { p: Person }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-xs font-semibold text-accent-text" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
    </span>
  );
}

function RoleChips({ roles, value, onChange }: { roles: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {roles.map((r) => {
        const on = value.includes(r);
        return (
          <button key={r} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            className={cn("inline-flex min-h-11 items-center gap-1 border px-3 text-sm", on ? "border-accent bg-accent/10 font-semibold text-accent-text" : "border-line text-ink/75 hover:border-ink/40")}>
            {on && <Check size={14} aria-hidden />}{r}
          </button>
        );
      })}
    </div>
  );
}

export function SquadBoard({ opp, board }: { opp: string; board: Board }) {
  const { pending, run } = useRun();
  const mine = board.squads.find((s) => s.id === board.my_squad) ?? null;
  const lead = mine?.lead_id === board.me;
  const invitesForMe = board.squads.flatMap((s) => s.pending.filter((p) => p.user_id === board.me && p.state === "invited").map((p) => ({ s, p })));
  const myRequests = board.squads.flatMap((s) => s.pending.filter((p) => p.user_id === board.me && p.state === "asked").map((p) => ({ s, p })));
  const others = board.squads.filter((s) => s.id !== board.my_squad);
  const free = !board.my_squad;

  return (
    <div className="space-y-8" data-squad-board>
      {invitesForMe.length > 0 && (
        <section className="border-2 border-accent bg-accent/5 p-4" data-squad-invites>
          <h2 className="font-serif text-xl text-ink">You are invited</h2>
          <ul className="mt-3 space-y-3">
            {invitesForMe.map(({ s, p }) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 text-sm"><strong className="text-ink">{s.name}</strong> wants you as <strong>{p.role}</strong>{s.idea ? ` · ${s.idea}` : ""}</span>
                <span className="flex gap-2">
                  <Button className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(opp, s.id, board.me, true))} data-accept-invite>Accept</Button>
                  <Button variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(opp, s.id, board.me, false))}>Decline</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine ? <MySquad opp={opp} squad={mine} board={board} lead={lead} pending={pending} run={run} />
        : board.my_pool_role ? <InPool opp={opp} board={board} pending={pending} run={run} />
          : <Start opp={opp} board={board} pending={pending} run={run} />}

      {myRequests.length > 0 && (
        <p className="text-sm text-ink/70">Waiting for an answer from: {myRequests.map(({ s }) => s.name).join(", ")}.</p>
      )}

      <section>
        <h2 className="flex items-center gap-2 font-serif text-2xl text-ink"><Users size={20} aria-hidden /> Squads ({others.length})</h2>
        {others.length === 0 ? <p className="mt-3 border border-dashed border-line p-4 text-sm text-ink/70">No other squad yet. Start one, or join the pool.</p> : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {others.map((s) => <li key={s.id} className="min-w-0"><SquadCard opp={opp} s={s} board={board} canAsk={free && !myRequests.some((r) => r.s.id === s.id)} pending={pending} run={run} /></li>)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl text-ink">In the pool ({board.pool.length})</h2>
        <p className="mt-1 text-sm text-ink/65">Members looking for a squad, with the role they can take.</p>
        {board.pool.length === 0 ? <p className="mt-3 border border-dashed border-line p-4 text-sm text-ink/70">Nobody in the pool yet.</p> : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {board.pool.map((p) => (
              <li key={p.user_id} className="flex min-w-0 items-start gap-3 border border-line bg-surface p-3" data-pool-person>
                <Avatar p={p} />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium text-ink">{p.name}{p.user_id === board.me ? " (you)" : ""}</span>
                  <span className="block text-accent-text">{p.role}</span>
                  {who(p) && <span className="block text-xs text-ink/60">{who(p)}</span>}
                  {p.skills && p.skills.length > 0 && <span className="mt-1 block text-xs text-ink/60">{p.skills.join(", ")}</span>}
                  {p.note && <span className="mt-1 block text-xs text-ink/70">“{p.note}”</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Run = ReturnType<typeof useRun>["run"];

function Start({ opp, board, pending, run }: { opp: string; board: Board; pending: boolean; run: Run }) {
  const [mode, setMode] = useState<"squad" | "pool" | null>(null);
  const [name, setName] = useState(""), [idea, setIdea] = useState(""), [role, setRole] = useState(""), [roles, setRoles] = useState<string[]>([]), [size, setSize] = useState(4);
  const [note, setNote] = useState("");
  const roleOptions = board.roles.filter((r) => r !== "Any role");
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className={cn("border p-5", mode === "squad" ? "border-accent" : "border-line bg-surface")}>
        <h2 className="font-serif text-xl text-ink">Start a squad</h2>
        <p className="mt-1 text-sm text-ink/70">Lead it: say what you want to build and which roles you still need.</p>
        {mode !== "squad" ? <Button className="mt-4 min-h-11" onClick={() => setMode("squad")} data-start-squad>Start a squad</Button> : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">Squad name <Input aria-label="Squad name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Byte Busters" /></label>
            <label className="block text-sm">Your idea, in one line (optional) <Input value={idea} maxLength={200} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. An app that finds free lab slots" /></label>
            <label className="block text-sm">Your role
              <Select aria-label="Your role" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11"><option value="">Choose</option>{roleOptions.map((r) => <option key={r}>{r}</option>)}</Select>
            </label>
            <div className="text-sm">Roles you still need<div className="mt-2"><RoleChips roles={roleOptions.filter((r) => r !== role)} value={roles} onChange={setRoles} /></div></div>
            <label className="block text-sm">Team size (with you)
              <Select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} className="min-h-11">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
            </label>
            <Button className="min-h-11 w-full sm:w-auto" disabled={pending || !name.trim() || !role} onClick={() => run(() => createSquad(opp, { name, idea, role, roles, size }))} data-create-squad>Create squad</Button>
          </div>
        )}
      </div>
      <div className={cn("border p-5", mode === "pool" ? "border-accent" : "border-line bg-surface")}>
        <h2 className="font-serif text-xl text-ink">Find me a squad</h2>
        <p className="mt-1 text-sm text-ink/70">Join the pool with your role. Squad leads who need you will invite you, and you will see squads that need your role.</p>
        {mode !== "pool" ? <Button variant="secondary" className="mt-4 min-h-11" onClick={() => setMode("pool")} data-join-pool>Put me in the pool</Button> : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">I can do
              <Select aria-label="I can do" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11"><option value="">Choose</option>{board.roles.map((r) => <option key={r}>{r}</option>)}</Select>
            </label>
            <label className="block text-sm">A note for leads (optional) <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. React + Figma, free on weekends" /></label>
            <Button className="min-h-11 w-full sm:w-auto" disabled={pending || !role} onClick={() => run(() => joinPool(opp, role, note))} data-pool-submit>Join the pool</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function InPool({ opp, board, pending, run }: { opp: string; board: Board; pending: boolean; run: Run }) {
  const needMe = board.squads.filter((s) => s.needs_me);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  return (
    <section className="space-y-5" data-in-pool>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-accent/50 bg-accent/5 p-4">
        <p className="text-sm text-ink">You are in the pool as <strong className="text-accent-text">{board.my_pool_role}</strong>. Leads who need you can invite you.</p>
        <Button variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => leavePool(opp))}>Leave the pool</Button>
      </div>
      {needMe.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2 font-serif text-xl text-ink"><Sparkles size={18} aria-hidden /> Squads that need you</h2>
          <ul className="mt-3 space-y-2">
            {needMe.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-3">
                <span className="min-w-0 text-sm"><strong className="text-ink">{s.name}</strong> · {s.size}/{s.size_max}{s.idea ? ` · ${s.idea}` : ""}</span>
                <Button className="min-h-11" disabled={pending} onClick={() => run(() => askToJoin(opp, s.id, board.my_pool_role ?? "Any role", ""))} data-ask-join>Ask to join as {board.my_pool_role}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {board.complements.length > 0 && (
        <div className="border border-line bg-surface p-4" data-complements>
          <h2 className="font-serif text-xl text-ink">Start a squad with these people</h2>
          <p className="mt-1 text-sm text-ink/70">They are in the pool and bring a different role from yours. Pick them; each one gets an invite.</p>
          <ul className="mt-3 space-y-2">
            {board.complements.map((p) => (
              <li key={p.user_id}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={picked.includes(p.user_id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.user_id] : picked.filter((x) => x !== p.user_id))} />
                  <Avatar p={p} /><span><strong className="text-ink">{p.name}</strong> · {p.role}{who(p) ? ` · ${who(p)}` : ""}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input className="min-h-11" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Squad name" aria-label="Squad name" />
            <Button className="min-h-11 shrink-0" disabled={pending || !picked.length || !name.trim()} onClick={() => run(() => squadFromPool(opp, name, "", picked))} data-squad-from-pool>Start and invite</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function MySquad({ opp, squad, board, lead, pending, run }: { opp: string; squad: Squad; board: Board; lead: boolean; pending: boolean; run: Run }) {
  const [roles, setRoles] = useState<string[]>(squad.roles_needed);
  const [editing, setEditing] = useState(false);
  const asks = squad.pending.filter((p) => p.state === "asked");
  const invited = squad.pending.filter((p) => p.state === "invited");
  return (
    <section className="border-2 border-accent p-5" data-my-squad>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-text">Your squad · {STATUS[squad.status]}</p>
          <h2 className="mt-1 break-words font-serif text-2xl text-ink">{squad.name}</h2>
          {squad.idea && <p className="mt-1 text-sm text-ink/75">{squad.idea}</p>}
        </div>
        <span className="text-sm text-ink/70">{squad.size}/{squad.size_max} members</span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {squad.members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 border border-line bg-surface p-3 text-sm">
            <Avatar p={m} /><span className="min-w-0"><span className="block font-medium text-ink">{m.name}{m.lead ? " · lead" : ""}</span><span className="block text-ink/65">{m.role}</span></span>
          </li>
        ))}
        {squad.status === "forming" && squad.open_roles.map((r) => (
          <li key={r} className="flex min-h-14 items-center gap-3 border border-dashed border-accent/60 p-3 text-sm text-ink/70" data-open-slot>
            <UserPlus size={18} className="text-accent-text" aria-hidden /> Open slot: <strong className="text-ink">{r}</strong>
          </li>
        ))}
      </ul>

      {lead && asks.length > 0 && (
        <div className="mt-5" data-squad-requests>
          <h3 className="font-semibold text-ink">Asking to join</h3>
          <ul className="mt-2 space-y-2">
            {asks.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-3">
                <span className="min-w-0 text-sm"><strong className="text-ink">{p.name}</strong> as {p.role}{who(p) ? ` · ${who(p)}` : ""}{p.skills?.length ? ` · ${p.skills.join(", ")}` : ""}{p.note ? ` · “${p.note}”` : ""}</span>
                <span className="flex gap-2">
                  <Button className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(opp, squad.id, p.user_id, true))} data-accept-request>Accept</Button>
                  <Button variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(opp, squad.id, p.user_id, false))} aria-label={`Decline ${p.name}`}><X size={16} aria-hidden /></Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lead && squad.status === "forming" && (
        <div className="mt-5" data-smart-picks>
          <h3 className="flex items-center gap-2 font-semibold text-ink"><Sparkles size={16} className="text-accent-text" aria-hidden /> Smart picks for your open slots</h3>
          {board.picks.length === 0 ? <p className="mt-2 text-sm text-ink/65">Nobody in the pool fits your open slots yet. You will see people here as they join the pool.</p> : (
            <ul className="mt-2 space-y-2">
              {board.picks.map((p) => (
                <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-3">
                  <span className="flex min-w-0 items-center gap-3 text-sm"><Avatar p={p} />
                    <span className="min-w-0"><strong className="text-ink">{p.name}</strong> · {p.role}<span className="block text-xs text-ink/60">For: {p.for_role}{who(p) ? ` · ${who(p)}` : ""}{p.skills?.length ? ` · ${p.skills.join(", ")}` : ""}</span></span>
                  </span>
                  <Button className="min-h-11" disabled={pending} onClick={() => run(() => inviteToSquad(opp, squad.id, p.user_id, p.for_role))} data-invite>Invite</Button>
                </li>
              ))}
            </ul>
          )}
          {invited.length > 0 && <p className="mt-2 text-sm text-ink/65">Invited, waiting: {invited.map((p) => `${p.name} (${p.role})`).join(", ")}.</p>}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        {lead && squad.status !== "registered" && (
          <Button className="min-h-11" disabled={pending} onClick={() => { if (window.confirm("Has your squad registered on the official site?")) run(() => setSquad(opp, squad.id, "registered", null)); }} data-mark-registered>
            We registered on the official site
          </Button>
        )}
        {lead && squad.status === "registered" && <Button variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => setSquad(opp, squad.id, "forming", null))}>Not registered yet</Button>}
        {lead && squad.status === "forming" && <Button variant="secondary" className="min-h-11" onClick={() => setEditing(!editing)}>Change open roles</Button>}
        <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => { if (window.confirm(lead ? "Leave the squad? The next member will lead it." : "Leave the squad?")) run(() => leaveSquad(opp, squad.id)); }}>Leave squad</Button>
      </div>
      {editing && (
        <div className="mt-4 space-y-3">
          <RoleChips roles={board.roles} value={roles} onChange={setRoles} />
          <Button className="min-h-11" disabled={pending} onClick={() => run(() => setSquad(opp, squad.id, null, roles), () => setEditing(false))}>Save roles</Button>
        </div>
      )}
    </section>
  );
}

function SquadCard({ opp, s, board, canAsk, pending, run }: { opp: string; s: Squad; board: Board; canAsk: boolean; pending: boolean; run: Run }) {
  const [role, setRole] = useState(board.my_pool_role ?? s.open_roles[0] ?? "");
  return (
    <article className="flex h-full flex-col border border-line bg-surface p-4" data-squad-card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-serif text-lg text-ink">{s.name}</h3>
        <span className={cn("shrink-0 border px-2 py-0.5 text-xs font-semibold", s.status === "registered" ? "border-emerald-600/60 text-emerald-700 dark:text-emerald-400" : s.status === "full" ? "border-line text-ink/70" : "border-accent text-accent-text")}>{STATUS[s.status]}</span>
      </div>
      {s.idea && <p className="mt-1 text-sm text-ink/75">{s.idea}</p>}
      <ul className="mt-3 space-y-1 text-sm">
        {s.members.map((m) => <li key={m.user_id} className="text-ink/80">{m.name} · <span className="text-ink/60">{m.role}{m.lead ? " (lead)" : ""}</span></li>)}
      </ul>
      {s.status === "forming" && s.open_roles.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">{s.open_roles.map((r) => <span key={r} className="border border-dashed border-accent/60 px-2 py-0.5 text-xs text-accent-text">Needs {r}</span>)}</p>
      )}
      <p className="mt-2 text-xs text-ink/60">{s.size}/{s.size_max} members</p>
      {canAsk && s.status === "forming" && (
        <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row">
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11" aria-label={`Your role in ${s.name}`}>
            <option value="">Your role</option>{board.roles.map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Button variant="secondary" className="min-h-11 shrink-0" disabled={pending || !role} onClick={() => run(() => askToJoin(opp, s.id, role, ""))} data-ask-join>Ask to join</Button>
        </div>
      )}
    </article>
  );
}
