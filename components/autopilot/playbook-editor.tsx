"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { HUBS, hubLabel } from "@/lib/autopilot/labels";
import { duplicatePlaybook, previewPlaybook, restorePlaybook, savePlaybook, toggleRule, type PreviewTask } from "@/actions/autopilot";
import { useRun } from "./center-parts";

type Variation = { key: string; name: string; description: string | null; scale: number; is_default: boolean };
type Task = {
  key: string; title: string; checklist: string[]; hub: string; skills: string[]; effort: "S" | "M" | "L"; offset_days: number; depends_on: string[];
  proof: "link" | "file" | "image" | "text"; review: "peer" | "lead" | "both"; open_seat_allowed: boolean; community_allowed: boolean; exam_safe: boolean;
  per_member: boolean; variations: string[]; archived: boolean;
};
export type EditorPlaybook = {
  id: string; name: string; description: string | null; exam_safe: boolean; needs_mentor_approval: boolean; default_visibility: "members" | "public";
  status: "active" | "archived"; variations: Variation[]; tasks: Task[];
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `t-${Math.random().toString(36).slice(2, 6)}`;
const blankTask = (): Task => ({ key: `task-${Math.random().toString(36).slice(2, 7)}`, title: "", checklist: [], hub: "any", skills: [], effort: "M", offset_days: 0, depends_on: [], proof: "link", review: "peer", open_seat_allowed: false, community_allowed: false, exam_safe: false, per_member: false, variations: [], archived: false });

export function PlaybookEditor({ playbook, canEdit }: { playbook: EditorPlaybook | null; canEdit: boolean }) {
  const { pending, run } = useRun();
  const [p, setP] = useState<EditorPlaybook>(playbook ?? { id: "", name: "", description: "", exam_safe: false, needs_mentor_approval: false, default_visibility: "members", status: "active", variations: [{ key: "standard", name: "Standard", description: null, scale: 1, is_default: true }], tasks: [blankTask()] });
  const [note, setNote] = useState("");
  const [previewAt, setPreviewAt] = useState({ variation: p.variations[0]?.key ?? "", date: new Date().toISOString().slice(0, 10) });
  const [preview, setPreview] = useState<PreviewTask[] | null>(null);
  const [previewError, setPreviewError] = useState("");
  const tasks = p.tasks.filter((t) => !t.archived);
  const setTask = (key: string, patch: Partial<Task>) => setP({ ...p, tasks: p.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) });
  const moveTask = (key: string, dir: -1 | 1) => {
    const list = [...p.tasks];
    const i = list.findIndex((t) => t.key === key), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setP({ ...p, tasks: list });
  };
  const save = () => run(() => savePlaybook(playbook?.id ?? null, {
    name: p.name, description: p.description, exam_safe: p.exam_safe, needs_mentor_approval: p.needs_mentor_approval, default_visibility: p.default_visibility, status: p.status,
    variations: p.variations.map((v) => ({ ...v, key: v.key || slug(v.name) })),
    tasks: p.tasks.filter((t) => t.title.trim()).map((t) => ({ ...t, key: t.key || slug(t.title) })),
  }, note), () => setNote(""));
  const ro = !canEdit;

  return (
    <div className="mt-3 space-y-5" data-playbook-editor>
      <section className="grid gap-3 border border-line bg-surface p-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Name <Input disabled={ro} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Description <Textarea disabled={ro} rows={2} maxLength={600} value={p.description ?? ""} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={ro} checked={p.exam_safe} onChange={(e) => setP({ ...p, exam_safe: e.target.checked })} /> Exam-safe (runs during club exams)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={ro} checked={p.needs_mentor_approval} onChange={(e) => setP({ ...p, needs_mentor_approval: e.target.checked })} /> Starts only after a mentor approves</label>
        <label className="text-sm">Default visibility
          <Select disabled={ro} value={p.default_visibility} onChange={(e) => setP({ ...p, default_visibility: e.target.value as "members" | "public" })}>
            <option value="members">Members only</option><option value="public">Public outcome</option>
          </Select>
        </label>
        <label className="text-sm">Status
          <Select disabled={ro} value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as "active" | "archived" })}>
            <option value="active">Active</option><option value="archived">Archived</option>
          </Select>
        </label>
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Variations</h2>
        <p className="text-xs text-ink/60">Scale stretches the task days: Standard 8 weeks is 2 × Lite 4 weeks.</p>
        <ul className="mt-3 space-y-2">
          {p.variations.map((v, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_90px_auto_auto] sm:items-center">
              <Input disabled={ro} aria-label="Name" value={v.name} onChange={(e) => setP({ ...p, variations: p.variations.map((x, j) => (j === i ? { ...x, name: e.target.value, key: x.key || slug(e.target.value) } : x)) })} />
              <Input disabled={ro} aria-label="Description" value={v.description ?? ""} onChange={(e) => setP({ ...p, variations: p.variations.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              <Input disabled={ro} aria-label="Scale" type="number" step="0.25" min="0.25" max="6" value={v.scale} onChange={(e) => setP({ ...p, variations: p.variations.map((x, j) => (j === i ? { ...x, scale: Number(e.target.value) } : x)) })} />
              <label className="flex items-center gap-1 text-xs"><input type="radio" disabled={ro} name="default-variation" checked={v.is_default} onChange={() => setP({ ...p, variations: p.variations.map((x, j) => ({ ...x, is_default: j === i })) })} /> default</label>
              {!ro && p.variations.length > 1 && <button type="button" aria-label="Remove variation" onClick={() => setP({ ...p, variations: p.variations.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
            </li>
          ))}
        </ul>
        {!ro && p.variations.length < 3 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setP({ ...p, variations: [...p.variations, { key: "", name: "New variation", description: null, scale: 1, is_default: false }] })}>Add variation</Button>}
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Tasks ({tasks.length})</h2>
        <ul className="mt-3 space-y-3">
          {tasks.map((t, idx) => (
            <li key={t.key} className="border border-line p-3" data-pb-task={t.key}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink/50">{idx + 1}</span>
                <Input disabled={ro} aria-label="Task title" placeholder="Task title" value={t.title} onChange={(e) => setTask(t.key, { title: e.target.value })} />
                {!ro && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Move up" onClick={() => moveTask(t.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Move down" onClick={() => moveTask(t.key, 1)}><ArrowDown size={14} /></button>
                    <button type="button" aria-label="Duplicate" onClick={() => setP({ ...p, tasks: [...p.tasks, { ...t, key: `${t.key}-copy-${Math.random().toString(36).slice(2, 5)}`, title: `${t.title} (copy)` }] })}><Copy size={14} /></button>
                    <button type="button" aria-label="Archive" onClick={() => setTask(t.key, { archived: true })}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Select disabled={ro} aria-label="Hub" value={t.hub} onChange={(e) => setTask(t.key, { hub: e.target.value })}>
                  <option value="any">Any hub</option>{HUBS.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
                </Select>
                <Select disabled={ro} aria-label="Effort" value={t.effort} onChange={(e) => setTask(t.key, { effort: e.target.value as Task["effort"] })}><option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option></Select>
                <label className="flex items-center gap-1 text-xs">Day <Input disabled={ro} type="number" value={t.offset_days} onChange={(e) => setTask(t.key, { offset_days: Number(e.target.value) })} /></label>
                <Select disabled={ro} aria-label="Proof" value={t.proof} onChange={(e) => setTask(t.key, { proof: e.target.value as Task["proof"] })}><option value="link">Proof: link</option><option value="file">Proof: file</option><option value="image">Proof: image</option><option value="text">Proof: text</option></Select>
                <Select disabled={ro} aria-label="Review" value={t.review} onChange={(e) => setTask(t.key, { review: e.target.value as Task["review"] })}><option value="peer">Peer review</option><option value="lead">Lead review</option><option value="both">Peer and lead</option></Select>
                <Input disabled={ro} aria-label="Skills" placeholder="Skills, comma separated" value={t.skills.join(", ")} onChange={(e) => setTask(t.key, { skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <Textarea disabled={ro} aria-label="Checklist" rows={2} className="mt-2" placeholder="Checklist, one line each" value={t.checklist.join("\n")} onChange={(e) => setTask(t.key, { checklist: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>After:</span>
                {tasks.filter((o) => o.key !== t.key).map((o) => (
                  <label key={o.key} className="flex items-center gap-1"><input type="checkbox" disabled={ro} checked={t.depends_on.includes(o.key)} onChange={(e) => setTask(t.key, { depends_on: e.target.checked ? [...t.depends_on, o.key] : t.depends_on.filter((x) => x !== o.key) })} />{o.title || o.key}</label>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {([["open_seat_allowed", "Open seat allowed"], ["community_allowed", "Community allowed"], ["exam_safe", "Exam-safe"], ["per_member", "One per member"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1"><input type="checkbox" disabled={ro} checked={t[k]} onChange={(e) => setTask(t.key, { [k]: e.target.checked })} />{label}</label>
                ))}
                <span className="ml-2">Only in:</span>
                {p.variations.map((v) => (
                  <label key={v.key || v.name} className="flex items-center gap-1"><input type="checkbox" disabled={ro} checked={t.variations.includes(v.key)} onChange={(e) => setTask(t.key, { variations: e.target.checked ? [...t.variations, v.key] : t.variations.filter((x) => x !== v.key) })} />{v.name}</label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {!ro && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setP({ ...p, tasks: [...p.tasks, blankTask()] })}>Add task</Button>}
      </section>

      {playbook && (
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Preview a mission</h2>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Select aria-label="Variation" value={previewAt.variation} onChange={(e) => setPreviewAt({ ...previewAt, variation: e.target.value })}>
              {p.variations.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
            </Select>
            <Input type="date" aria-label="Mission date" value={previewAt.date} onChange={(e) => setPreviewAt({ ...previewAt, date: e.target.value })} />
            <Button size="sm" variant="secondary" onClick={async () => { setPreviewError(""); const r = await previewPlaybook(playbook.id, previewAt.variation, previewAt.date); if (r.ok) setPreview(r.tasks); else setPreviewError(r.error); }}>Preview</Button>
          </div>
          <p className="mt-1 text-xs text-ink/60">From the saved version.</p>
          {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
          {preview && (
            <ol className="mt-3 space-y-1 text-sm" data-pb-preview>
              {preview.filter((t, i, all) => all.findIndex((x) => x.key === t.key) === i).map((t) => (
                <li key={t.key} className="flex justify-between gap-2"><span>{t.title}{t.member_for ? " (one per member)" : ""} <span className="text-xs text-ink/60">· {hubLabel(t.hub)}{t.depends_keys.length ? ` · after ${t.depends_keys.join(", ")}` : ""}</span></span><span className="shrink-0 text-xs">{t.due_on}</span></li>
              ))}
              <li className="pt-1 text-xs text-ink/60">Total effort: {preview.reduce((n, t) => n + ({ S: 1, M: 2, L: 3 }[t.effort as "S"] ?? 2), 0)} points ({preview.length} tasks)</li>
            </ol>
          )}
        </section>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input aria-label="What changed" placeholder="What changed (kept in the version history)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={pending || !p.name.trim()} onClick={save} data-pb-save>Save as a new version</Button>
          {playbook && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => duplicatePlaybook(playbook.id))}>Duplicate</Button>}
        </div>
      )}
    </div>
  );
}

export function PlaybookVersionRestore({ id, version }: { id: string; version: number }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => restorePlaybook(id, version))}>Restore</Button>;
}

export function RuleToggle({ id, on, disabled }: { id: string; on: boolean; disabled: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={on} disabled={disabled || pending} onChange={(e) => run(() => toggleRule(id, e.target.checked))} /> {on ? "On" : "Off"}
    </label>
  );
}
