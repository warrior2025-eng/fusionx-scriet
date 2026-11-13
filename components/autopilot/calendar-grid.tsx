"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { applyPlan, previewPlan, type PlanPreview } from "@/actions/autopilot";
import { cn } from "@/lib/utils";
import type { Health } from "@/lib/autopilot/labels";
import { useRun } from "./center-parts";
import { PreviewList } from "./mission-parts";

export type CalendarDay = {
  date: string; inMonth: boolean; today: boolean; exam: string | null; busy: number;
  missions: { id: string; title: string; health: Health; movable: boolean }[];
  tasks: { id: string; title: string; mission: string }[];
  events: { id: string; title: string }[];
};

const DOT: Record<Health, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarGrid({ days, week }: { days: CalendarDay[]; week: boolean }) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [move, setMove] = useState<{ id: string; title: string; to: string; preview: PlanPreview | null; error: string; reason: string } | null>(null);

  async function dropOn(date: string, id: string, title: string) {
    setMove({ id, title, to: date, preview: null, error: "", reason: "Moved on the calendar" });
    dialog.current?.showModal();
    const r = await previewPlan(id, { mission_date: date });
    setMove((m) => m && (r.ok ? { ...m, preview: r.preview } : { ...m, error: r.error }));
  }

  return (
    <>
      <div className="grid grid-cols-7 border-l border-t border-line text-[11px] sm:text-xs" data-calendar>
        {WEEKDAYS.map((w) => <div key={w} className="border-b border-r border-line px-1 py-1 text-center font-semibold text-ink/60">{w}</div>)}
        {days.map((d) => (
          <div key={d.date}
            className={cn("min-h-20 border-b border-r border-line p-1 sm:min-h-28", !d.inMonth && "opacity-45", d.exam && "bg-amber-500/10", week && "min-h-48")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const data = e.dataTransfer.getData("text/plain"); if (data) { const [id, ...t] = data.split("|"); dropOn(d.date, id, t.join("|")); } }}
            data-day={d.date}>
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", d.today ? "rounded-sm bg-accent px-1 text-white" : "text-ink/70")}>{Number(d.date.slice(8))}</span>
              {d.busy > 0 && <span className="text-ink/55" title={`${d.busy} busy`}>{d.busy}✕</span>}
            </div>
            {d.exam && <p className="truncate text-amber-800 dark:text-amber-300">{d.exam}</p>}
            <ul className="mt-0.5 space-y-0.5">
              {d.missions.map((m) => (
                <li key={m.id} draggable={m.movable} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${m.id}|${m.title}`)}
                  className={cn("flex items-center gap-1 truncate border border-line bg-paper px-1", m.movable && "cursor-grab")} data-cal-mission={m.id}>
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[m.health])} aria-hidden />
                  <Link href={`/command/missions?m=${m.id}`} className="truncate text-ink hover:underline">{m.title}</Link>
                </li>
              ))}
              {d.events.map((e) => <li key={e.id} className="truncate text-accent-text">★ {e.title}</li>)}
              {d.tasks.slice(0, week ? 12 : 2).map((t) => <li key={t.id} className="hidden truncate text-ink/60 sm:block">· {t.title}</li>)}
              {!week && d.tasks.length > 2 && <li className="hidden text-ink/50 sm:block">+{d.tasks.length - 2} tasks</li>}
            </ul>
          </div>
        ))}
      </div>
      <dialog ref={dialog} className="m-auto w-[min(94vw,560px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        {move && (
          <>
            <h2 className="font-serif text-xl">Move {move.title} to {move.to}?</h2>
            <div className="mt-3">{move.error ? <p className="text-sm text-red-600">{move.error}</p> : move.preview ? <PreviewList preview={move.preview} /> : <p className="text-sm text-ink/60">Working out what shifts…</p>}</div>
            <label className="mt-3 block text-sm">Why <Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} /></label>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => dialog.current?.close()}>Cancel</Button>
              <Button size="sm" disabled={pending || !move.preview || !move.reason.trim()} onClick={() => run(() => applyPlan(move.id, { mission_date: move.to }, move.reason), () => dialog.current?.close())}>Move</Button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
