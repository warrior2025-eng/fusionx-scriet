"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { HUBS } from "@/lib/autopilot/labels";
import { applyPlan, missionAction, previewPlan, restorePlan, taskOverride, type PlanPreview } from "@/actions/autopilot";
import { useRun } from "./center-parts";

type Member = { id: string; name: string };

/** What a plan change would do, shown before it is applied. */
export function PreviewList({ preview }: { preview: PlanPreview }) {
  const rows: [string, string[]][] = [
    ["Tasks added", preview.added.map((a) => `${a.title} · ${a.due_on}`)],
    ["Tasks removed", preview.removed.map((r) => r.title)],
    ["Kept (work already done)", preview.kept.map((k) => k.title)],
    ["Tasks moved", preview.moved.map((m) => `${m.title}: ${m.from} → ${m.to}`)],
    ["People affected", preview.people],
  ];
  const nothing = rows.every(([, list]) => list.length === 0);
  return (
    <div className="space-y-2 text-sm" data-plan-preview>
      {nothing ? <p className="text-ink/70">Nothing changes for the tasks.</p> : rows.filter(([, list]) => list.length).map(([label, list]) => (
        <div key={label}><p className="font-semibold text-ink">{label} ({list.length})</p><ul className="list-inside list-disc text-ink/80">{list.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
      <p className="text-xs text-ink/60">{preview.notifications} {preview.notifications === 1 ? "person is" : "people are"} told. New mission date: {preview.new_date}.</p>
    </div>
  );
}

export function ChangePlan({ mission, variations, members, tasks }: {
  mission: { id: string; variation: string | null; date: string; owner: string | null; hubs: string[] };
  variations: { key: string; name: string }[]; members: Member[]; tasks: { id: string; title: string; status: string }[];
}) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ variation: mission.variation ?? "", date: mission.date, owner: mission.owner ?? "", hubs: mission.hubs, remove: [] as string[], addTitle: "", addDue: "", reason: "" });
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [error, setError] = useState("");
  const changes = () => {
    const c: Record<string, unknown> = {};
    if (f.variation && f.variation !== mission.variation) c.variation_key = f.variation;
    if (f.date !== mission.date) c.mission_date = f.date;
    if (f.owner && f.owner !== mission.owner) c.owner_id = f.owner;
    if (f.hubs.slice().sort().join() !== mission.hubs.slice().sort().join()) c.hubs = f.hubs;
    if (f.remove.length) c.remove_tasks = f.remove;
    if (f.addTitle.trim()) c.add_tasks = [{ title: f.addTitle.trim(), due_on: f.addDue || f.date }];
    return c;
  };
  async function doPreview() {
    setError("");
    const r = await previewPlan(mission.id, changes());
    if (r.ok) setPreview(r.preview); else setError(r.error);
  }
  return (
    <>
      <Button size="sm" onClick={() => { setPreview(null); dialog.current?.showModal(); }} data-change-plan>Change plan</Button>
      <dialog ref={dialog} className="m-auto max-h-[90vh] w-[min(94vw,640px)] overflow-y-auto border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h2 className="font-serif text-xl">Change plan</h2>
        <p className="text-sm text-ink/65">See what shifts before you apply. Finished work and contributions are never lost.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {variations.length > 0 && (
            <label className="text-sm">Variation
              <Select value={f.variation} onChange={(e) => { setF({ ...f, variation: e.target.value }); setPreview(null); }} data-plan-variation>
                {variations.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
              </Select>
            </label>
          )}
          <label className="text-sm">Mission date <Input type="date" value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); setPreview(null); }} data-plan-date /></label>
          <label className="text-sm">Owner
            <Select value={f.owner} onChange={(e) => { setF({ ...f, owner: e.target.value }); setPreview(null); }}>
              <option value="">Keep</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </label>
          <fieldset className="text-sm sm:col-span-2"><legend>Hubs</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {HUBS.map((h) => (
                <label key={h.slug} className="flex items-center gap-2"><input type="checkbox" checked={f.hubs.includes(h.slug)}
                  onChange={(e) => { setF({ ...f, hubs: e.target.checked ? [...f.hubs, h.slug] : f.hubs.filter((x) => x !== h.slug) }); setPreview(null); }} /> {h.label}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm sm:col-span-2"><legend>Remove tasks (scope down)</legend>
            <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
              {tasks.filter((t) => !["approved", "submitted"].includes(t.status)).map((t) => (
                <label key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={f.remove.includes(t.id)}
                  onChange={(e) => { setF({ ...f, remove: e.target.checked ? [...f.remove, t.id] : f.remove.filter((x) => x !== t.id) }); setPreview(null); }} /> {t.title}</label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">Add a task (scope up) <Input value={f.addTitle} onChange={(e) => { setF({ ...f, addTitle: e.target.value }); setPreview(null); }} placeholder="Title" /></label>
          <label className="text-sm">Its due date <Input type="date" value={f.addDue} onChange={(e) => { setF({ ...f, addDue: e.target.value }); setPreview(null); }} /></label>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          {preview ? <PreviewList preview={preview} /> : <Button size="sm" variant="secondary" onClick={doPreview} data-plan-preview-button>Preview</Button>}
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        {preview && (
          <label className="mt-4 block text-sm">Why (kept in the version history)
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. The venue moved" data-plan-reason />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button size="sm" disabled={pending || !preview || !f.reason.trim()} onClick={() => run(() => applyPlan(mission.id, changes(), f.reason), () => dialog.current?.close())} data-plan-apply>Apply</Button>
        </div>
      </dialog>
    </>
  );
}

export function MissionActions({ id, status, links }: { id: string; status: string; links: string[] }) {
  const { pending, run } = useRun();
  const [mode, setMode] = useState<"" | "done" | "cancel">("");
  const [text, setText] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {["planned", "active"].includes(status) && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => missionAction(id, "pause"))}>Pause</Button>}
      {status === "paused" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => missionAction(id, "resume"))}>Resume</Button>}
      {status === "active" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => missionAction(id, "review"))}>To review</Button>}
      {["active", "review"].includes(status) && <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setMode("done"); setText(links.join("\n")); }}>Mark done</Button>}
      {status === "done" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => missionAction(id, "reopen"))}>Reopen</Button>}
      {!["done", "cancelled"].includes(status) && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setMode("cancel"); setText(""); }}>Cancel mission</Button>}
      {mode && (
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {mode === "done"
            ? <textarea className="w-full border border-line bg-paper p-2 text-sm" rows={2} placeholder="Outcome links, one per line (post, photos, repo…)" value={text} onChange={(e) => setText(e.target.value)} />
            : <Input placeholder="Reason (required)" value={text} onChange={(e) => setText(e.target.value)} />}
          <Button size="sm" disabled={pending} onClick={() => run(() => mode === "done" ? missionAction(id, "done", undefined, text.split(/\s+/).filter(Boolean)) : missionAction(id, "cancel", text), () => setMode(""))}>Confirm</Button>
        </div>
      )}
    </div>
  );
}

export function TaskControls({ task, members }: { task: { id: string; status: string; locked: boolean; due: string; assignee: string | null }; members: Member[] }) {
  const { pending, run } = useRun();
  const [who, setWho] = useState("");
  const [date, setDate] = useState(task.due);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select aria-label="Assign to" value={who} onChange={(e) => setWho(e.target.value)} className="h-8 w-36 text-xs">
        <option value="">{task.assignee ? "Reassign…" : "Assign…"}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      {who && <Button size="sm" disabled={pending} onClick={() => run(() => taskOverride(task.id, "assign", who), () => setWho(""))}>Assign + lock</Button>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskOverride(task.id, task.locked ? "unlock" : "lock"))}>{task.locked ? "Unlock" : "Lock"}</Button>
      {task.status !== "approved"
        ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskOverride(task.id, "close", undefined, undefined, "Force-closed"))}>Force-close</Button>
        : <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskOverride(task.id, "reopen"))}>Reopen</Button>}
      <Input type="date" aria-label="Move to" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36 text-xs" />
      {date !== task.due && <Button size="sm" disabled={pending} onClick={() => run(() => taskOverride(task.id, "move", undefined, date, "Date moved"))}>Move</Button>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskOverride(task.id, "cancel", undefined, undefined, "Removed"))}>Remove</Button>
    </div>
  );
}

export function VersionRestore({ id, version }: { id: string; version: number }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => restorePlan(id, version))}>Restore this plan</Button>;
}
