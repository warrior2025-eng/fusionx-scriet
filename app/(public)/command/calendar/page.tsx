import type { Metadata } from "next";
import Link from "next/link";
import { CalendarGrid, type CalendarDay } from "@/components/autopilot/calendar-grid";
import { getAutopilotViewer, healthOf, todayIST } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Calendar" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const today = todayIST();
  const week = sp.view === "week";
  let start: string, end: string, label: string, prev: string, next: string;
  if (week) {
    const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
    const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
    start = addDays(anchor, -dow);
    end = addDays(start, 6);
    label = `Week of ${new Date(`${start}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
    prev = `?view=week&date=${addDays(start, -7)}`;
    next = `?view=week&date=${addDays(start, 7)}`;
  } else {
    const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const first = `${month}-01`;
    const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    start = addDays(first, -dow);
    const lastOfMonth = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    end = addDays(lastOfMonth, 6 - ((new Date(`${lastOfMonth}T00:00:00Z`).getUTCDay() + 6) % 7));
    label = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    const d = new Date(`${first}T00:00:00Z`);
    prev = `?month=${iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7)}`;
    next = `?month=${iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))).slice(0, 7)}`;
  }

  const [{ data: missions }, { data: tasks }, { data: events }, { data: exams }, { data: busy }] = await Promise.all([
    supabase.from("missions").select("id, title, mission_date, status").gte("mission_date", start).lte("mission_date", end).not("status", "in", "(cancelled)"),
    supabase.from("mission_tasks").select("id, title, due_on, status, mission_id").gte("due_on", start).lte("due_on", end).not("status", "in", "(cancelled,approved)"),
    supabase.from("events").select("id, title, event_date").gte("event_date", start).lte("event_date", end),
    supabase.from("club_exam_periods").select("name, starts_on, ends_on").lte("starts_on", end).gte("ends_on", start),
    supabase.from("availability").select("user_id, starts_on, ends_on").lte("starts_on", end).gte("ends_on", start),
  ]);
  const health = await healthOf(supabase, (missions ?? []).map((m) => m.id as string));
  const days: CalendarDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({
      date: d,
      inMonth: week || d.slice(0, 7) === (sp.month ?? today.slice(0, 7)),
      today: d === today,
      exam: ((exams ?? []) as { name: string; starts_on: string; ends_on: string }[]).find((e) => d >= e.starts_on && d <= e.ends_on)?.name ?? null,
      busy: new Set(((busy ?? []) as { user_id: string; starts_on: string; ends_on: string }[]).filter((b) => d >= b.starts_on && d <= b.ends_on).map((b) => b.user_id)).size,
      missions: ((missions ?? []) as { id: string; title: string; mission_date: string; status: string }[]).filter((m) => m.mission_date === d).map((m) => ({ id: m.id, title: m.title, health: health.get(m.id) ?? "green", movable: !["done", "cancelled"].includes(m.status) })),
      tasks: ((tasks ?? []) as { id: string; title: string; due_on: string; mission_id: string }[]).filter((t) => t.due_on === d).map((t) => ({ id: t.id, title: t.title, mission: t.mission_id })),
      events: ((events ?? []) as { id: string; title: string; event_date: string }[]).filter((e) => e.event_date === d).map((e) => ({ id: e.id, title: e.title })),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href={`/command/calendar${prev}`} className="border border-line px-2 py-1 text-sm" aria-label="Earlier">←</Link>
          <h2 className="font-serif text-xl text-ink">{label}</h2>
          <Link href={`/command/calendar${next}`} className="border border-line px-2 py-1 text-sm" aria-label="Later">→</Link>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/command/calendar" className={week ? "" : "font-semibold underline"}>Month</Link>
          <Link href="/command/calendar?view=week" className={week ? "font-semibold underline" : ""}>Week</Link>
        </div>
      </div>
      <p className="text-xs text-ink/60">Drag a mission to another day: you see what shifts first. Shaded days are club exams; the number is how many people are busy.</p>
      <CalendarGrid days={days} week={week} />
    </div>
  );
}
