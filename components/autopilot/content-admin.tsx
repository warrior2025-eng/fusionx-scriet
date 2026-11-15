"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { addCollegeOpportunity, contentAction, deleteBatch, pauseFeature, publishIdeaOpen, runAutomationNow, saveTool } from "@/actions/autopilot-auto";
import { setMaster } from "@/actions/autopilot";
import { TOOL_CATEGORIES } from "@/lib/tools/candidates";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { useRun } from "./center-parts";

/** Second row under Outcomes: the content Autopilot makes, and what was deleted. Wraps on phones (no sideways scroll). */
export function ContentNav() {
  const pathname = usePathname();
  const items = [["/command/outcomes", "Outcomes"], ["/command/ideas", "Ideas"], ["/command/opportunities", "Opportunities"], ["/command/tools", "Tools"], ["/command/deleted", "Recently deleted"]];
  return (
    <nav aria-label="Content" className="mb-5 flex flex-wrap gap-2" data-content-nav>
      {items.map(([href, label]) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center border px-3 text-sm", pathname === href ? "border-ink font-semibold text-ink" : "border-line text-ink/70 hover:text-ink")}>{label}</Link>
      ))}
    </nav>
  );
}

export type Automation = { key: string; label: string; next: string; paused: { name?: string; at?: string } | null };

/** Today: one On / Paused toggle per automation; "Pause all" is the master switch (super admin). */
export function AutomationsCard({ items, canPause, superAdmin, masterOn }: { items: Automation[]; canPause: boolean; superAdmin: boolean; masterOn: boolean }) {
  const { pending, run } = useRun();
  const [running, setRunning] = useState<string | null>(null);
  return (
    <section className="border border-line bg-surface p-4" data-automations>
      <h2 className="font-serif text-lg text-ink">Automations</h2>
      {!masterOn && <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-400">All automations are paused.</p>}
      {canPause && (
        <>
          <Button className="mt-3 min-h-11 w-full font-semibold" disabled={pending || !masterOn}
            onClick={() => { if (window.confirm("Run all automations now? New ideas, research topics, opportunities and a tool are added, and members get notified.")) { setRunning("all"); run(() => runAutomationNow("all"), () => setRunning(null)); } }}
            data-run-all>
            <RefreshCw size={16} className={running === "all" && pending ? "animate-spin" : ""} aria-hidden /> {running === "all" && pending ? "Starting…" : "Run all now"}
          </Button>
          <p className="mt-1 text-xs text-ink/60">Adds everything right away instead of waiting for the next run.</p>
        </>
      )}
      <ul className="mt-3 divide-y divide-line">
        {items.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 py-2" data-automation={a.key}>
            <span className="min-w-0 text-sm"><span className="font-medium text-ink">{a.label}</span>
              <span className="block text-xs text-ink/65">{a.paused ? `Paused by ${a.paused.name ?? "an admin"} on ${a.paused.at ? new Date(a.paused.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : ""}` : `Next run: ${a.next}`}</span></span>
            {canPause && (
              <span className="flex items-center gap-2">
              <button type="button" disabled={pending || !!a.paused || !masterOn} aria-label={`Run ${a.label} now`}
                onClick={() => { if (a.key !== "ideas" || window.confirm("Send a new set of ideas to every member now?")) { setRunning(a.key); run(() => runAutomationNow(a.key as Parameters<typeof runAutomationNow>[0]), () => setRunning(null)); } }}
                className="inline-flex min-h-11 items-center gap-1.5 border border-line px-3 text-sm font-semibold text-ink hover:border-accent disabled:opacity-50" data-run-now={a.key}>
                <RefreshCw size={14} className={running === a.key && pending ? "animate-spin" : ""} aria-hidden /> {running === a.key && pending ? "Running…" : "Run now"}
              </button>
              <button type="button" role="switch" aria-checked={!a.paused} aria-label={`${a.label}: ${a.paused ? "paused" : "on"}`} disabled={pending}
                onClick={() => run(() => pauseFeature(a.key, !a.paused))}
                className={cn("inline-flex min-h-11 min-w-20 items-center justify-center border px-3 text-sm font-semibold", a.paused ? "border-line text-ink/70" : "border-accent bg-accent text-white")}>
                {a.paused ? "Paused" : "On"}
              </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {superAdmin && <Button size="sm" variant="secondary" className="mt-3 min-h-11" disabled={pending} onClick={() => run(() => setMaster(!masterOn))} data-pause-all>{masterOn ? "Pause all automations" : "Resume all automations"}</Button>}
    </section>
  );
}

/** A list with checkboxes and Hide / Show / Delete (with a reason) / Restore for the selected rows. On phones each row is a card. */
export function BulkList({ kind, rows, actions }: { kind: "idea" | "opportunity" | "tool" | "project"; rows: { id: string; title: string; meta: string; extra?: React.ReactNode }[]; actions: ("hide" | "show" | "delete" | "restore")[] }) {
  const { pending, run } = useRun();
  const [picked, setPicked] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  if (!rows.length) return <p className="border border-dashed border-line p-4 text-sm text-ink/70">Nothing here.</p>;
  return (
    <div data-bulk={kind}>
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 border border-line bg-paper p-2">
        <label className="flex min-h-11 items-center gap-2 px-1 text-sm"><input type="checkbox" className="h-5 w-5" checked={picked.length === rows.length} onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} /> All ({picked.length} selected)</label>
        {actions.includes("hide") && <Button size="sm" variant="secondary" className="min-h-11" disabled={pending || !picked.length} onClick={() => run(() => contentAction(kind, picked, "hide"), () => setPicked([]))}>Hide</Button>}
        {actions.includes("show") && <Button size="sm" variant="secondary" className="min-h-11" disabled={pending || !picked.length} onClick={() => run(() => contentAction(kind, picked, "show"), () => setPicked([]))}>Show</Button>}
        {actions.includes("restore") && <Button size="sm" className="min-h-11" disabled={pending || !picked.length} onClick={() => run(() => contentAction(kind, picked, "restore"), () => setPicked([]))} data-restore>Restore</Button>}
        {actions.includes("delete") && <Button size="sm" variant="ghost" className="min-h-11 text-red-700 dark:text-red-400" disabled={pending || !picked.length} onClick={() => dialog.current?.showModal()} data-delete>Delete</Button>}
      </div>
      <ul className="mt-2 divide-y divide-line border border-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 p-3">
            <input type="checkbox" aria-label={`Select ${r.title}`} className="mt-1 h-5 w-5 shrink-0" checked={picked.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-ink">{r.title}</p><p className="break-words text-xs text-ink/65">{r.meta}</p>{r.extra}</div>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h2 className="font-serif text-xl">Delete {picked.length} item{picked.length === 1 ? "" : "s"}?</h2>
        <p className="mt-1 text-sm text-ink/70">They disappear from the site and FusionX AI at once. You can restore them for 7 days in Recently deleted.</p>
        <Input className="mt-3" aria-label="Reason (optional)" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => contentAction(kind, picked, "delete", reason), () => { setPicked([]); setReason(""); dialog.current?.close(); })} data-confirm-delete>Delete</Button>
        </div>
      </dialog>
    </div>
  );
}

export function DeleteBatchButton({ kind, batch, label }: { kind: "ideas" | "opportunities"; batch: string; label: string }) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" className="min-h-11 text-red-700 dark:text-red-400" onClick={() => dialog.current?.showModal()} data-delete-batch>{label}</Button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h2 className="font-serif text-xl">{label}?</h2>
        <p className="mt-1 text-sm text-ink/70">{kind === "ideas" ? "They leave everyone's My work at once. Projects already started from them stay with their owners." : "Every item from this morning's run is removed. Restore within 7 days."}</p>
        <Input className="mt-3" aria-label="Reason (optional)" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => deleteBatch(kind, batch, reason), () => dialog.current?.close())}>Delete</Button>
        </div>
      </dialog>
    </>
  );
}

export function PublishOpen({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="secondary" className="mt-2 min-h-11" disabled={pending} onClick={() => run(() => publishIdeaOpen(id, ""))} data-publish-open>Publish to Projects</Button>;
}

const CATS = [["hackathon", "Hackathon"], ["competition", "Competition"], ["ideathon", "Ideathon"], ["workshop", "Workshop"], ["tech_fest", "Tech fest / event"], ["internship", "Internship"], ["fellowship", "Fellowship"], ["scholarship", "Scholarship"], ["research", "Research call"], ["conference", "Conference"]];

/** "Add college opportunity": published at once in At SCRIET. */
export function CollegeOpportunityForm() {
  const { pending, run } = useRun();
  const empty = { title: "", organizer: "SCRIET", category: "workshop", description: "", eligibility: "", deadline: "", link: "", mode: "offline", cost: "free", team_mode: "either", eligibility_level: "any", has_prize: false, rolling: false };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty, v: string | boolean) => setF({ ...f, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-college-form>
      <label className="text-sm sm:col-span-2">Title <Input value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="text-sm">Organiser <Input value={f.organizer} onChange={(e) => set("organizer", e.target.value)} /></label>
      <label className="text-sm">Type <Select value={f.category} onChange={(e) => set("category", e.target.value)} className="min-h-11">{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      <label className="text-sm sm:col-span-2">Description <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className="text-sm">Deadline <Input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></label>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" className="h-5 w-5" checked={f.rolling} onChange={(e) => set("rolling", e.target.checked)} /> Rolling (no deadline)</label>
      <label className="text-sm">Link <Input value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="Registration or details" /></label>
      <label className="text-sm">Mode <Select value={f.mode} onChange={(e) => set("mode", e.target.value)} className="min-h-11"><option value="offline">Offline</option><option value="online">Online</option><option value="hybrid">Hybrid</option></Select></label>
      <label className="text-sm">Cost <Select value={f.cost} onChange={(e) => set("cost", e.target.value)} className="min-h-11"><option value="free">Free</option><option value="paid">Paid</option><option value="not_stated">Not stated</option></Select></label>
      <label className="text-sm">Team <Select value={f.team_mode} onChange={(e) => set("team_mode", e.target.value)} className="min-h-11"><option value="either">Solo or team</option><option value="solo">Solo</option><option value="team">Team</option></Select></label>
      <label className="text-sm">Eligibility <Select value={f.eligibility_level} onChange={(e) => set("eligibility_level", e.target.value)} className="min-h-11"><option value="any">Any year</option><option value="first_year">1st year friendly</option><option value="pg">PG or other</option></Select></label>
      <label className="text-sm">Who can apply <Input value={f.eligibility} onChange={(e) => set("eligibility", e.target.value)} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.has_prize} onChange={(e) => set("has_prize", e.target.checked)} /> Has prize / stipend</label>
      <Button size="sm" className="min-h-11 sm:col-span-2 sm:justify-self-start" disabled={pending || !f.title.trim()} onClick={() => run(() => addCollegeOpportunity(f), () => setF(empty))}>Publish in At SCRIET</Button>
    </div>
  );
}

export type ToolEdit = { id: string | null; slug: string; name: string; category: string; what: string; why: string; uses: string[]; steps: string[]; tips: string[]; free_label: string; official_url: string; docs_url: string; sort: number };

/** Edit (or add by hand) one tool. */
export function ToolEditor({ tool }: { tool: ToolEdit | null }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ToolEdit>(tool ?? { id: null, slug: "", name: "", category: "code", what: "", why: "", uses: ["", "", ""], steps: ["", "", "", "", ""], tips: ["", "", ""], free_label: "Check pricing on the official site", official_url: "", docs_url: "", sort: 100 });
  if (!open) return <Button size="sm" variant={tool ? "ghost" : "secondary"} className="min-h-11" onClick={() => setOpen(true)}>{tool ? "Edit" : "Add a tool by hand"}</Button>;
  const lines = (k: "uses" | "steps" | "tips", label: string) => <label className="text-sm sm:col-span-2">{label} (one per line)<Textarea rows={k === "steps" ? 5 : 3} value={f[k].join("\n")} onChange={(e) => setF({ ...f, [k]: e.target.value.split("\n") })} /></label>;
  return (
    <div className="mt-2 grid w-full gap-3 border border-line p-3 sm:grid-cols-2">
      <label className="text-sm">Name <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></label>
      <label className="text-sm">Category <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="min-h-11">{TOOL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></label>
      <label className="text-sm sm:col-span-2">What it is <Input value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} /></label>
      <label className="text-sm sm:col-span-2">Why it matters <Textarea rows={2} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} /></label>
      {lines("uses", "You'll use it for")}{lines("steps", "Get started in 5 steps")}{lines("tips", "Tips")}
      <label className="text-sm">Free? <Select value={f.free_label} onChange={(e) => setF({ ...f, free_label: e.target.value })} className="min-h-11">{["Free", "Free plan available", "Check pricing on the official site"].map((x) => <option key={x}>{x}</option>)}</Select></label>
      <label className="text-sm">Order <Input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></label>
      <label className="text-sm">Official website <Input value={f.official_url} onChange={(e) => setF({ ...f, official_url: e.target.value })} /></label>
      <label className="text-sm">Official docs / learn <Input value={f.docs_url} onChange={(e) => setF({ ...f, docs_url: e.target.value })} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => saveTool(f.id, { ...f, uses: f.uses.filter(Boolean), steps: f.steps.filter(Boolean), tips: f.tips.filter(Boolean) }), () => setOpen(false))}>Save</Button>
        <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
