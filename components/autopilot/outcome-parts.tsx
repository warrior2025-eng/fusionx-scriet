"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import {
  adoptIdea, certificateAction, hideFromPublic, ideaAction, likeIdea, makeShareCard, opportunityDraftAction, prepareCertificates, publishNow,
  saveForeword, setShowOnImpact, startIdea, suggestOpportunity, suggestRecognition, writeStorySummary,
} from "@/actions/autopilot-outcomes";
import { useRun } from "./center-parts";

export function PublishNow() {
  const { pending, run } = useRun();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => publishNow())} data-publish-now>Update now</Button>;
}

export function StorySummary({ missionId, initial }: { missionId: string; initial: string | null }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(initial ?? "");
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <Textarea aria-label="Summary" rows={2} maxLength={600} placeholder="2–3 lines (optional; it publishes without one 3 days after it is done)" value={text} onChange={(e) => setText(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => writeStorySummary(missionId, text))}>Save</Button>
    </div>
  );
}

export function HideToggle({ kind, id, hidden }: { kind: "mission" | "person"; id: string; hidden: boolean }) {
  const { pending, run } = useRun();
  return <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => hideFromPublic(kind, id, !hidden))}>{hidden ? "Show on public pages" : "Hide from public pages"}</button>;
}

export function CertificateTools() {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => prepareCertificates())} data-prepare-certificates>Prepare this semester&apos;s certificates</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => suggestRecognition())}>Suggest last month&apos;s top contributors</Button>
    </div>
  );
}

export function RevokeCertificate({ code }: { code: string }) {
  const { pending, run } = useRun();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Revoke</button>;
  return (
    <span className="flex gap-1.5">
      <Input aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 text-xs" />
      <Button size="sm" variant="ghost" disabled={pending || !reason.trim()} onClick={() => run(() => certificateAction(code, "revoke", reason))}>Revoke</Button>
    </span>
  );
}

export function Foreword({ initial }: { initial: string }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-2">
      <Textarea aria-label="Foreword" rows={3} maxLength={1500} placeholder="Optional foreword for the HOD and Director" value={text} onChange={(e) => setText(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => saveForeword(text))}>Save foreword</Button>
    </div>
  );
}

// ── Idea Engine (Command Center) ────────────────────────────────────────

export function IdeaActions({ id, kind, members }: { id: string; kind: "project" | "research"; members: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ variation: kind === "project" ? "standard" : "paper", owner: "", date: "", reason: "" });
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select aria-label="Variation" value={f.variation} onChange={(e) => setF({ ...f, variation: e.target.value })}>
        {kind === "project" ? <><option value="lite">Lite · 4 weeks</option><option value="standard">Standard · 8 weeks</option><option value="ambitious">Ambitious · 12 weeks</option></> : <><option value="paper">Paper</option><option value="patent">Idea to patent</option></>}
      </Select>
      <Select aria-label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
        <option value="">{kind === "project" ? "Projects hub lead" : "The suggested mentor"}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      <Input type="date" aria-label="Target date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <Button size="sm" disabled={pending} onClick={() => run(() => adoptIdea(id, f.variation, f.owner, f.date))} data-adopt>Adopt</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => ideaAction(id, "save"))}>Save for members</Button>
      <Input aria-label="Reason" placeholder="Reason to reject" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => ideaAction(id, "reject", f.reason || "Not for us"))}>Reject</Button>
    </div>
  );
}

export function OpportunityActions({ id, ideas }: { id: string; ideas: { id: string; title: string }[] }) {
  const { pending, run } = useRun();
  const [idea, setIdea] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => opportunityDraftAction(id, "publish"))} data-publish-opp>Publish</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => opportunityDraftAction(id, "mission"))}>Run as mission</Button>
      {ideas.length > 0 && (
        <>
          <Select aria-label="Match an idea" value={idea} onChange={(e) => setIdea(e.target.value)} className="h-8 w-48 text-xs"><option value="">Match an idea…</option>{ideas.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select>
          {idea && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => opportunityDraftAction(id, "match", idea))}>Match</Button>}
        </>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => opportunityDraftAction(id, "reject"))}>Reject</Button>
    </div>
  );
}

// ── My work ─────────────────────────────────────────────────────────────

export function ShareCardButton({ missionId, code }: { missionId: string; code: string | null }) {
  const { pending, run } = useRun();
  const [made, setMade] = useState(code);
  if (made) {
    const url = `${typeof window === "undefined" ? "" : location.origin}/impact/card/${made}`;
    return (
      <span className="flex flex-wrap gap-3 text-sm">
        <a className="text-accent-text underline" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>Share on LinkedIn</a>
        <a className="underline" href={`/impact/card/${made}/image`} download={`fusionx-${made}.png`}>Download image</a>
        <a className="underline" href={`/impact/card/${made}`}>Open</a>
      </span>
    );
  }
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => makeShareCard(missionId), (r) => setMade(r.viewHref?.split("/").pop() ?? null))} data-make-card>Make my share card</Button>;
}

export function ShowOnImpact({ show }: { show: boolean }) {
  const { pending, run } = useRun();
  return (
    <label className="flex items-center gap-2 text-sm text-ink/80">
      <input type="checkbox" checked={show} disabled={pending} onChange={(e) => run(() => setShowOnImpact(e.target.checked))} /> Show me on public pages (Now building, stories) for my verified work
    </label>
  );
}

export function SavedIdea({ id, liked, likes }: { id: string; liked: boolean; likes: number }) {
  const { pending, run } = useRun();
  const [variation, setVariation] = useState("lite");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => likeIdea(id))}>{liked ? "♥" : "♡"} {likes}</Button>
      <Select aria-label="Plan" value={variation} onChange={(e) => setVariation(e.target.value)} className="h-8 w-40 text-xs"><option value="lite">Lite · 4 weeks</option><option value="standard">Standard · 8 weeks</option><option value="ambitious">Ambitious · 12 weeks</option></Select>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => startIdea(id, variation))}>Start it as my project</Button>
    </div>
  );
}

export function SuggestOpportunity() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", organiser: "", link: "", deadline: "", city: "", mode: "online" });
  if (!open) return <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>Suggest an opportunity</button>;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <Input aria-label="Title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <Input aria-label="Organiser" placeholder="Organiser" value={f.organiser} onChange={(e) => setF({ ...f, organiser: e.target.value })} />
      <Input aria-label="Official link" placeholder="Official link" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
      <Input type="date" aria-label="Registration deadline" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
      <Input aria-label="City" placeholder="City (empty if online)" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      <Select aria-label="Mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option></Select>
      <Button size="sm" disabled={pending} onClick={() => run(() => suggestOpportunity(f), () => setOpen(false))}>Send</Button>
    </div>
  );
}
