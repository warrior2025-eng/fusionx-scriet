"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { HUBS } from "@/lib/autopilot/labels";
import {
  applyForSeat, decideSeat, nominateTalent, openSeat, projectMilestone, projectPlan, projectStatus, projectTask, requestProjectSupport,
  setCommunitySettings, submitPitch, takeCommunityTask, votePitch,
} from "@/actions/autopilot-people";
import type { PlanPreview } from "@/actions/autopilot";
import { useRun } from "./center-parts";
import { PreviewList } from "./mission-parts";

// ── Open seats ──────────────────────────────────────────────────────────

export function OpenSeatButton({ taskId }: { taskId: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState("");
  const [note, setNote] = useState("");
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-open-seat>Open a seat</Button>;
  return (
    <div className="flex w-full flex-col gap-1.5 sm:flex-row">
      <Input aria-label="Skill" placeholder="Skill (e.g. Figma)" value={skill} onChange={(e) => setSkill(e.target.value)} />
      <Input aria-label="Note" placeholder="What the person will do" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => openSeat(taskId, skill, note), () => setOpen(false))}>Open</Button>
    </div>
  );
}

export function SeatDecision({ applicationId }: { applicationId: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => decideSeat(applicationId, true))}>Accept</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideSeat(applicationId, false))}>Decline</Button>
    </div>
  );
}

export function ApplyForSeat({ seatId }: { seatId: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState("");
  const [work, setWork] = useState("");
  if (!open) return <Button size="sm" onClick={() => setOpen(true)} data-apply-seat>Apply</Button>;
  return (
    <div className="mt-2 space-y-2">
      <Textarea aria-label="Why you" rows={3} maxLength={500} placeholder="2–3 lines: why you fit, and when you can do it" value={pitch} onChange={(e) => setPitch(e.target.value)} />
      <Input aria-label="Previous work" placeholder="A link to previous work (optional)" value={work} onChange={(e) => setWork(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => applyForSeat(seatId, pitch, work), () => setOpen(false))}>Send</Button>
    </div>
  );
}

// ── Community tasks ─────────────────────────────────────────────────────

export function TakeTask({ taskId }: { taskId: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" disabled={pending} onClick={() => run(() => takeCommunityTask(taskId))} data-take-task>Take it</Button>;
}

// ── Pitches ─────────────────────────────────────────────────────────────

export function PitchForm() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", summary: "", hub: "", small: "", full: "" });
  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-pitch-form>Pitch an idea</Button>;
  return (
    <div className="space-y-2 border border-line p-3" data-pitch-open>
      <Input aria-label="Title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <Textarea aria-label="Pitch" rows={3} maxLength={800} placeholder="2–3 lines: the problem, who has it, what we would make" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Small version" placeholder="Small version (optional)" value={f.small} onChange={(e) => setF({ ...f, small: e.target.value })} />
        <Input aria-label="Full version" placeholder="Full version (optional)" value={f.full} onChange={(e) => setF({ ...f, full: e.target.value })} />
      </div>
      <Select aria-label="Hub" value={f.hub} onChange={(e) => setF({ ...f, hub: e.target.value })}>
        <option value="">Which hub fits best? (optional)</option>{HUBS.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
      </Select>
      <Button size="sm" disabled={pending} onClick={() => run(() => submitPitch(f.title, f.summary, f.hub, f.small, f.full), () => setOpen(false))}>Pitch it</Button>
    </div>
  );
}

export function PitchVote({ pitchId, options, mine }: { pitchId: string; options: { key: string; name: string; description: string; votes: number }[]; mine: string | null }) {
  const { pending, run } = useRun();
  return (
    <ul className="mt-2 space-y-1.5">
      {options.map((o) => (
        <li key={o.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-ink"><strong>{o.name}</strong> · {o.description} <span className="text-xs text-ink/60">({o.votes})</span></span>
          <Button size="sm" variant={mine === o.key ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => votePitch(pitchId, o.key))}>{mine === o.key ? "Your vote" : "Vote"}</Button>
        </li>
      ))}
    </ul>
  );
}

// ── Rising Talent and community settings ────────────────────────────────

export function Nominate({ userId }: { userId: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Nominate for Rising Talent</button>;
  return (
    <div className="mt-1 flex gap-2">
      <Input aria-label="Why" placeholder="Why (one line)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => nominateTalent(userId, reason), () => setOpen(false))}>Nominate</Button>
    </div>
  );
}

export function CommunityToggles({ settings }: { settings: { community_on: boolean; talent_on: boolean; projects_on: boolean } }) {
  const { pending, run } = useRun();
  const row = (key: keyof typeof settings, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={settings[key]} onChange={(e) => run(() => setCommunitySettings({ [key]: e.target.checked }))} /> {label}</label>
  );
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-6" data-community-toggles>
      {row("community_on", "Community members: open seats, community tasks, pitches")}
      {row("talent_on", "Rising Talent suggestions")}
      {row("projects_on", "Project tracking")}
    </div>
  );
}

// ── Projects ────────────────────────────────────────────────────────────

export function ProjectPlanForm({ projectId, variation, target }: { projectId: string; variation: string | null; target: string | null }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ variation: variation ?? "lite", target: target ?? "" });
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3" data-project-plan>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select aria-label="Plan" value={f.variation} onChange={(e) => { setF({ ...f, variation: e.target.value }); setPreview(null); }}>
          <option value="lite">Lite · 4 weeks</option><option value="standard">Standard · 8 weeks</option><option value="ambitious">Ambitious · 12 weeks (with a public launch)</option><option value="none">No plan, I&apos;ll add milestones myself</option>
        </Select>
        <Input type="date" aria-label="Target date" value={f.target} onChange={(e) => { setF({ ...f, target: e.target.value }); setPreview(null); }} />
        <Button size="sm" variant="secondary" onClick={async () => { setError(""); const r = await projectPlan(projectId, f.variation === "none" ? null : f.variation, f.target, false); if (r.ok) setPreview(r.preview); else setError(r.error); }}>Preview</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {preview && (
        <>
          <PreviewList preview={preview} />
          <Button size="sm" disabled={pending} onClick={() => run(async () => { const r = await projectPlan(projectId, f.variation === "none" ? null : f.variation, f.target, true); return r.ok ? { status: "success", message: "Plan saved." } : { status: "error", message: r.error }; }, () => setPreview(null))}>Apply</Button>
        </>
      )}
    </div>
  );
}

export function MilestoneControls({ projectId, id, done }: { projectId: string; id: string; done: boolean }) {
  const { pending, run } = useRun();
  const [proof, setProof] = useState("");
  return done ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => projectMilestone(projectId, "reopen", id, "", "", ""))}>Reopen</Button>
  ) : (
    <div className="flex flex-col gap-1.5 sm:flex-row">
      <Input aria-label="Proof link" placeholder="Proof link (demo, repo, post…)" value={proof} onChange={(e) => setProof(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => projectMilestone(projectId, "done", id, "", "", proof))}>Mark done</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => projectMilestone(projectId, "delete", id, "", "", ""))}>Remove</Button>
    </div>
  );
}

export function AddMilestone({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row">
      <Input aria-label="Milestone" placeholder="New milestone" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={pending || !title.trim()} onClick={() => run(() => projectMilestone(projectId, "add", null, title, due, ""), () => { setTitle(""); setDue(""); })}>Add milestone</Button>
    </div>
  );
}

export function AddProjectTask({ projectId, milestones, team }: { projectId: string; milestones: { id: string; title: string }[]; team: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ title: "", milestone: "", assignee: "", due: "" });
  return (
    <div className="grid gap-1.5 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <Input aria-label="Task" placeholder="New task" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <Select aria-label="Milestone" value={f.milestone} onChange={(e) => setF({ ...f, milestone: e.target.value })}><option value="">No milestone</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>
      <Select aria-label="Assignee" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Nobody yet</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
      <Input type="date" aria-label="Due" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
      <Button size="sm" variant="secondary" disabled={pending || !f.title.trim()} onClick={() => run(() => projectTask(projectId, "add", null, f.title, f.milestone, f.assignee, f.due), () => setF({ title: "", milestone: "", assignee: "", due: "" }))}>Add</Button>
    </div>
  );
}

export function ProjectTaskControls({ projectId, id, done, supported }: { projectId: string; id: string; done: boolean; supported: boolean }) {
  const { pending, run } = useRun();
  if (supported) return <span className="text-xs text-ink/60">Proof and review in My work</span>;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => projectTask(projectId, done ? "reopen" : "done", id, "", "", "", ""))}>{done ? "Reopen" : "Done"}</Button>
      {!done && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => projectTask(projectId, "delete", id, "", "", "", ""))}>Remove</Button>}
    </div>
  );
}

export function ProjectStatusOverride({ projectId, status, locked }: { projectId: string; status: string; locked: boolean }) {
  const { pending, run } = useRun();
  const [s, setS] = useState(status);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <Select aria-label="Status" value={s} onChange={(e) => setS(e.target.value)} className="sm:w-44">
        {["idea", "building", "prototype", "testing", "completed", "continued"].map((x) => <option key={x} value={x}>{x}</option>)}
      </Select>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => projectStatus(projectId, s, true))}>Set by hand</Button>
      {locked && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => projectStatus(projectId, "", false))}>Let progress set it</Button>}
    </div>
  );
}

export function SupportRequest({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row" data-support-request>
      <Input aria-label="Why" placeholder="What support would help (users, mentors, a team)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => requestProjectSupport(projectId, note))}>Request FusionX support</Button>
    </div>
  );
}
