"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { AREAS, HUBS, LEVEL_LABEL, NUMBERS, PERMISSION_TOKENS, type Level } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";
import { dryRun, safeAreasToAuto, saveNumbers, savePermission, setLevel, setPauses, undoAutomation, type DryRunLine } from "@/actions/autopilot";
import { useRun } from "./center-parts";

const LATER = { people: "with open seats, community and projects", outcomes: "with outcomes and the Idea Engine" } as const;

export function LevelGrid({ levels }: { levels: Record<string, Level> }) {
  const { pending, run } = useRun();
  return (
    <ul className="mt-3 divide-y divide-line" data-levels>
      {AREAS.map((a) => {
        const current = levels[a.key] ?? "suggest";
        return (
          <li key={a.key} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-ink">{a.label}{a.safe && <span className="ml-2 text-xs text-accent-text">safe</span>}{a.later && <span className="ml-2 text-xs text-ink/55">({LATER[a.later]})</span>}</span>
            <div role="radiogroup" aria-label={a.label} className="flex border border-line">
              {(["auto", "suggest", "manual"] as const).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={current === l} disabled={pending}
                  onClick={() => current !== l && run(() => setLevel(a.key, l))}
                  className={cn("px-3 py-1 text-xs", current === l ? "bg-ink text-paper" : "text-ink/70 hover:bg-ink/5")} data-level={`${a.key}:${l}`}>
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SafeToAuto() {
  const { pending, run } = useRun();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => safeAreasToAuto())} data-safe-auto>Switch safe areas to Auto</Button>;
}

export function NumbersForm({ numbers }: { numbers: Record<string, number> }) {
  const { pending, run } = useRun();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(NUMBERS.map((n) => [n.key, String(numbers[n.key] ?? n.def)])));
  return (
    <div className="mt-3">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {NUMBERS.map((n) => (
          <label key={n.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink/80">{n.label}{n.unit ? ` (${n.unit})` : ""}{n.later && <span className="text-xs text-ink/55"> · {LATER[n.later]}</span>}</span>
            <Input type="number" min={n.min} max={n.max} className="w-20 shrink-0" value={values[n.key]} onChange={(e) => setValues({ ...values, [n.key]: e.target.value })} data-number={n.key} />
          </label>
        ))}
      </div>
      <Button size="sm" className="mt-3" disabled={pending} onClick={() => run(() => saveNumbers(values))}>Save numbers</Button>
    </div>
  );
}

export function PausesForm({ pauses, playbooks, rules, missions }: { pauses: Record<string, string[]>; playbooks: { id: string; name: string }[]; rules: { id: string; name: string }[]; missions: { id: string; title: string }[] }) {
  const { pending, run } = useRun();
  const [p, setP] = useState<Record<string, string[]>>({ hubs: pauses.hubs ?? [], playbooks: pauses.playbooks ?? [], rules: pauses.rules ?? [], missions: pauses.missions ?? [] });
  const toggle = (kind: string, id: string, on: boolean) => setP({ ...p, [kind]: on ? [...(p[kind] ?? []), id] : (p[kind] ?? []).filter((x) => x !== id) });
  const group = (kind: string, label: string, items: { id: string; name: string }[]) => (
    <fieldset className="text-sm"><legend className="font-semibold text-ink">{label}</legend>
      {items.length === 0 ? <p className="text-xs text-ink/60">None.</p> : (
        <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
          {items.map((i) => <label key={i.id} className="flex items-center gap-2"><input type="checkbox" checked={(p[kind] ?? []).includes(i.id)} onChange={(e) => toggle(kind, i.id, e.target.checked)} />{i.name}</label>)}
        </div>
      )}
    </fieldset>
  );
  return (
    <div className="mt-3">
      <p className="text-sm text-ink/60">Ticked ones are paused: nothing new happens for them until you untick. (Projects can be paused here once they are tracked.)</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {group("hubs", "Hubs", HUBS.map((h) => ({ id: h.slug, name: h.label })))}
        {group("playbooks", "Playbooks", playbooks)}
        {group("rules", "Rules", rules)}
        {group("missions", "Missions", missions.map((m) => ({ id: m.id, name: m.title })))}
      </div>
      <Button size="sm" className="mt-3" disabled={pending} onClick={() => run(() => setPauses(p))}>Save pauses</Button>
    </div>
  );
}

export function PermissionsGrid({ rows }: { rows: { action: string; label: string; allowed: string[] }[] }) {
  const { pending, run } = useRun();
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-permissions>
        <thead><tr className="text-left text-xs text-ink/60"><th className="p-1.5">Who may…</th>{PERMISSION_TOKENS.map((t) => <th key={t.key} className="p-1.5 text-center">{t.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.action}>
              <td className="p-1.5 text-ink">{r.label}</td>
              {PERMISSION_TOKENS.map((t) => (
                <td key={t.key} className="p-1.5 text-center">
                  <input type="checkbox" aria-label={`${r.label}: ${t.label}`} disabled={pending || t.key === "super_admin"} checked={t.key === "super_admin" || r.allowed.includes(t.key)}
                    onChange={(e) => run(() => savePermission(r.action, e.target.checked ? [...r.allowed, t.key] : r.allowed.filter((x) => x !== t.key)))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DryRun() {
  const [lines, setLines] = useState<DryRunLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-3">
      <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); const r = await dryRun(7); setBusy(false); if (r.ok) setLines(r.lines); else setError(r.error); }} data-dry-run>
        {busy ? "Working…" : "Show the next 7 days"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {lines && (lines.length === 0 ? <p className="mt-2 text-sm text-ink/60">Nothing would happen.</p> : (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto text-sm" data-dry-run-lines>
          {lines.map((l, i) => (
            <li key={i}><span className="text-xs text-ink/60">{new Date(l.at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })} · {l.kind === "done" ? "would do" : "would suggest"} ·</span> {l.text}</li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export function UndoButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => undoAutomation(id))}>Undo</Button>;
}
