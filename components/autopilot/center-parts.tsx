"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { toast, toastResult } from "@/components/admin/toast";
import type { ActionState } from "@/lib/admin/action-state";
import { HUBS } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";
import { addExamPeriod, approveAllSafe, decideQueueItem, removeExamPeriod, setFounderExamMode, setMaster, startMission } from "@/actions/autopilot";

export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: (r: ActionState) => void) =>
    start(async () => {
      const result = await fn();
      toastResult(result);
      if (result.status === "success") {
        after?.(result);
        if (result.redirectTo) router.push(result.redirectTo);
        else router.refresh();
      }
    });
  return { pending, run };
}

type Member = { id: string; name: string };
type QueueRow = { id: string; area: string; kind: string; title: string; detail: string | null; payload: Record<string, string>; safe: boolean; hub: string | null };

const KIND_LABEL: Record<string, string> = {
  create_mission: "New mission", offer_task: "Offer", reoffer: "Re-offer", reminder: "Reminder", escalate: "Late task", red_task: "Late task",
  red_mission: "Red mission", review_reroute: "Late review", exam_shift: "Exams", change_request: "Change request", checkins: "Check-ins", weekly_email: "Weekly email",
  seat_application: "Open seat", talent: "Rising Talent", collab_end: "Collaborator", pitch: "Pitch", project_support: "Project support",
};

/** What the people-side items (migration 0043) can be edited with before Approve. */
export type QueueExtra = { playbooks: { id: string; name: string }[]; missions: { id: string; title: string }[]; groups: { id: string; name: string }[] };

/** One prepared item: Approve, Edit (where it can be changed), Skip. */
export function QueueItem({ item, members, variations, extra }: { item: QueueRow; members: Member[]; variations: { playbook_id: string; key: string; name: string }[]; extra?: QueueExtra }) {
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, unknown>>({});
  const info = ["red_mission", "red_task"].includes(item.kind);
  const editable = ["create_mission", "offer_task", "change_request", "talent", "collab_end", "pitch", "project_support"].includes(item.kind);
  // A pitch needs its playbook and date before it can become a mission.
  const mustEdit = item.kind === "pitch" && !(edit.playbook_id && edit.date);
  return (
    <li className={cn("border p-3", info ? "border-red-500/40 bg-red-500/5" : "border-line bg-surface")} data-queue-item={item.kind}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">
            {KIND_LABEL[item.kind] ?? item.kind}{item.safe && <span className="ml-2 inline-flex items-center gap-0.5 text-accent-text"><ShieldCheck size={11} aria-hidden /> safe</span>}
          </p>
          <p className="text-sm font-medium text-ink">{item.title}</p>
          {item.detail && <p className="text-xs text-ink/60">{item.detail}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" disabled={pending || mustEdit} title={mustEdit ? "Edit: choose a playbook and a date" : undefined} onClick={() => run(() => decideQueueItem(item.id, true, editing ? edit : undefined))}>{info ? "Seen" : "Approve"}</Button>
          {editable && <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing((v) => !v)}>Edit</Button>}
          {!info && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideQueueItem(item.id, false, item.kind === "talent" ? { decision: "not_now" } : undefined))}>{item.kind === "talent" ? "Not now" : item.kind === "collab_end" ? "End" : "Skip"}</Button>}
          {item.kind === "talent" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideQueueItem(item.id, false, { decision: "decline" }))}>Decline</Button>}
          {info && item.payload.mission_id && <a className="self-center text-xs underline" href={`/command/missions?m=${item.payload.mission_id}`}>Open</a>}
        </div>
      </div>
      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          {item.kind === "create_mission" && (
            <>
              <Input aria-label="Title" placeholder="Title (optional)" onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))} />
              <Select aria-label="Variation" defaultValue="" onChange={(e) => setEdit((s) => ({ ...s, variation_key: e.target.value }))}>
                <option value="">Rule&apos;s variation</option>
                {variations.filter((v) => !item.payload.playbook_id || v.playbook_id === item.payload.playbook_id).map((v) => <option key={`${v.playbook_id}-${v.key}`} value={v.key}>{v.name}</option>)}
              </Select>
              <Input aria-label="Goal" placeholder="Goal (optional)" className="sm:col-span-2" onChange={(e) => setEdit((s) => ({ ...s, goal: e.target.value }))} />
            </>
          )}
          {item.kind === "offer_task" && (
            <Select aria-label="Offer to" defaultValue={item.payload.user_id} onChange={(e) => setEdit({ user_id: e.target.value })}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
          {item.kind === "change_request" && <Input type="date" aria-label="New date" onChange={(e) => setEdit({ new_due: e.target.value })} />}
          {item.kind === "talent" && extra && (
            <>
              <label className="text-sm sm:col-span-2">Core Collaborator for these missions
                <select multiple className="mt-1 h-24 w-full border border-line bg-paper text-sm" aria-label="Missions"
                  onChange={(e) => setEdit((s) => ({ ...s, mission_ids: [...e.target.selectedOptions].map((o) => o.value) }))}>
                  {extra.missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
              <Select aria-label="Or a Core team" defaultValue="" onChange={(e) => setEdit((s) => ({ ...s, group_id: e.target.value }))}>
                <option value="">…or a Core team / hub</option>{extra.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
              <Input type="date" aria-label="Until (default 8 weeks)" onChange={(e) => setEdit((s) => ({ ...s, until: e.target.value }))} />
            </>
          )}
          {item.kind === "collab_end" && (
            <>
              <Select aria-label="Decision" defaultValue="extend" onChange={(e) => setEdit((s) => ({ ...s, action: e.target.value }))}>
                <option value="extend">Extend</option><option value="shortlist">Shortlist in the next recruitment (note for admins only)</option><option value="end">End</option>
              </Select>
              <Input type="date" aria-label="Extend until" onChange={(e) => setEdit((s) => ({ ...s, until: e.target.value }))} />
            </>
          )}
          {item.kind === "pitch" && extra && (
            <>
              <Select aria-label="Playbook" defaultValue="" onChange={(e) => setEdit((s) => ({ ...s, playbook_id: e.target.value }))}>
                <option value="">Playbook…</option>{extra.playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select aria-label="Variation" defaultValue="" onChange={(e) => setEdit((s) => ({ ...s, variation_key: e.target.value }))}>
                <option value="">Default variation</option>{variations.filter((v) => v.playbook_id === edit.playbook_id).map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
              </Select>
              <Input type="date" aria-label="Mission date" onChange={(e) => setEdit((s) => ({ ...s, date: e.target.value }))} />
              <Input aria-label="Reason if declining" placeholder="Reason (if you skip it)" onChange={(e) => setEdit((s) => ({ ...s, reason: e.target.value }))} />
            </>
          )}
          {item.kind === "project_support" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" onChange={(e) => setEdit({ public: e.target.checked ? "true" : "false" })} /> Public outcome (Now building, story page)</label>
          )}
          <p className="text-xs text-ink/60 sm:col-span-2">Then press Approve.</p>
        </div>
      )}
    </li>
  );
}

export function ApproveAllSafe({ count }: { count: number }) {
  const { pending, run } = useRun();
  return <Button size="sm" disabled={pending} onClick={() => run(() => approveAllSafe())} data-approve-safe><ShieldCheck size={14} aria-hidden /> Approve all safe items ({count})</Button>;
}

export function StartMission({ playbooks, variations, members }: { playbooks: { id: string; name: string; default_visibility: string }[]; variations: { playbook_id: string; key: string; name: string; is_default: boolean }[]; members: Member[] }) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ playbook: playbooks[0]?.id ?? "", variation: "", date: "", title: "", goal: "", owner: "", hubs: [] as string[], visibility: "" });
  const vs = variations.filter((v) => v.playbook_id === f.playbook);
  return (
    <>
      <Button size="sm" onClick={() => dialog.current?.showModal()} data-start-mission>Start mission</Button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,520px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h2 className="font-serif text-xl">Start a mission</h2>
        <div className="mt-4 grid gap-3">
          <label className="text-sm">Playbook
            <Select value={f.playbook} onChange={(e) => setF({ ...f, playbook: e.target.value, variation: "" })}>
              {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Variation
              <Select value={f.variation} onChange={(e) => setF({ ...f, variation: e.target.value })}>
                <option value="">Default</option>
                {vs.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
              </Select>
            </label>
            <label className="text-sm">Mission date
              <Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </label>
          </div>
          <label className="text-sm">Title <Input placeholder="Optional: the playbook's name and date" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="text-sm">Goal <Textarea rows={2} maxLength={400} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} /></label>
          <label className="text-sm">Owner
            <Select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
              <option value="">The first hub&apos;s lead</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </label>
          <fieldset className="text-sm">
            <legend>Hubs (empty: the playbook&apos;s)</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {HUBS.map((h) => (
                <label key={h.slug} className="flex items-center gap-2">
                  <input type="checkbox" checked={f.hubs.includes(h.slug)} onChange={(e) => setF({ ...f, hubs: e.target.checked ? [...f.hubs, h.slug] : f.hubs.filter((x) => x !== h.slug) })} /> {h.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">Visibility
            <Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>
              <option value="">Playbook default</option>
              <option value="members">Members only</option>
              <option value="public">Public outcome</option>
            </Select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button size="sm" disabled={pending || !f.date} onClick={() => run(() => startMission(f), () => dialog.current?.close())}>Start</Button>
        </div>
      </dialog>
    </>
  );
}

export function MasterButton({ on }: { on: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setMaster(!on))} data-master={on ? "on" : "paused"}>
      {on ? "Pause Autopilot" : "Resume Autopilot"}
    </Button>
  );
}

/** A founder in exams: approvals go to the Head of Execution and hub leads; only the weekly email reaches them. */
export function FounderExamToggle({ userId, on, current }: { userId: string; on: boolean; current: string[] }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center gap-2 text-sm text-ink/80">
      <input type="checkbox" checked={on} disabled={pending}
        onChange={(e) => run(() => setFounderExamMode(e.target.checked ? [...new Set([...current, userId])] : current.filter((x) => x !== userId)))} />
      I&apos;m in exams (only the weekly email)
    </label>
  );
}

export function ExamPeriods({ rows, canEdit }: { rows: { id: string; name: string; starts_on: string; ends_on: string }[]; canEdit: boolean }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ name: "", from: "", to: "" });
  return (
    <div className="mt-3 space-y-2 text-sm">
      {rows.length === 0 ? <p className="text-ink/60">None. Add your club exam dates.</p> : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>{r.name}: {r.starts_on} → {r.ends_on}</span>
              {canEdit && <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => removeExamPeriod(r.id))}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Name" placeholder="Mid-sems" className="col-span-2" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Button size="sm" variant="secondary" className="col-span-2" disabled={pending} onClick={() => run(() => addExamPeriod(f.name, f.from, f.to), () => setF({ name: "", from: "", to: "" }))} data-mark-exams>Mark exam period</Button>
        </div>
      )}
    </div>
  );
}

export function CopyText({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button size="sm" variant="secondary" data-copy-whatsapp={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast("error", "Copy did not work in this browser.");
        }
      }}>
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {label}
    </Button>
  );
}
