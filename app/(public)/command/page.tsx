import type { Metadata } from "next";
import Link from "next/link";
import { ApproveAllSafe, CopyText, ExamPeriods, FounderExamToggle, MasterButton, QueueItem, StartMission } from "@/components/autopilot/center-parts";
import { dayLabel, daysFromToday, getAutopilotViewer, peopleById, todayIST } from "@/lib/autopilot/server";
import { HUBS, hubLabel, TASK_STATUS_LABEL } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center · Today" };

export default async function TodayPage() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase, user } = viewer;
  const today = todayIST();
  const weekEnd = new Date(new Date(`${today}T00:00:00Z`).getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const weekStart = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 864e5).toISOString().slice(0, 10);

  const [queue, myTasks, deadlines, playbooks, variations, members, exams, settings, done, upcoming] = await Promise.all([
    supabase.from("autopilot_queue").select("id, area, kind, title, detail, payload, safe, hub, created_at").eq("status", "pending").order("safe").order("created_at").limit(200),
    supabase.from("mission_tasks").select("id, title, due_on, status, mission:missions(title)").eq("assignee_id", user.id).in("status", ["accepted", "changes", "offered"]).order("due_on"),
    supabase.from("mission_tasks").select("id, title, due_on, status, hub, assignee_id, mission:missions(id, title, status)").gte("due_on", today).lte("due_on", weekEnd).not("status", "in", "(approved,cancelled)").order("due_on").limit(60),
    supabase.from("playbooks").select("id, name, default_visibility").eq("status", "active").order("sort"),
    supabase.from("playbook_variations").select("playbook_id, key, name, is_default").order("sort"),
    supabase.from("core_group_members").select("user_id, is_lead, group:core_groups(slug, kind)"),
    supabase.from("club_exam_periods").select("id, name, starts_on, ends_on").gte("ends_on", today).order("starts_on"),
    supabase.from("autopilot_settings").select("master, founder_exam_mode").eq("id", 1).maybeSingle(),
    supabase.from("contributions").select("title, user_id, mission:missions(title, hubs)").gte("contributed_on", weekStart).order("contributed_on", { ascending: false }).limit(80),
    supabase.from("missions").select("title, mission_date, hubs").in("status", ["planned", "active"]).gte("mission_date", today).lte("mission_date", weekEnd).order("mission_date"),
  ]);

  type Q = { id: string; area: string; kind: string; title: string; detail: string | null; payload: Record<string, string>; safe: boolean; hub: string | null };
  type D = { id: string; title: string; due_on: string; status: string; hub: string; assignee_id: string | null; mission: { id: string; title: string; status: string } | null };
  const items = (queue.data ?? []) as Q[];
  const due = ((deadlines.data ?? []) as unknown as D[]).filter((d) => d.mission && !["cancelled", "paused"].includes(d.mission.status));
  const memberRows = (members.data ?? []) as unknown as { user_id: string; is_lead: boolean; group: { slug: string; kind: string } | null }[];
  const people = await peopleById(supabase, [...memberRows.map((m) => m.user_id), ...due.map((d) => d.assignee_id), ...((done.data ?? []) as { user_id: string }[]).map((c) => c.user_id)]);
  const memberOptions = [...people.entries()].map(([id, p]) => ({ id, name: p.full_name })).sort((a, b) => a.name.localeCompare(b.name));
  const safeCount = items.filter((i) => i.safe).length;
  const founderMode = ((settings.data?.founder_exam_mode as string[] | undefined) ?? []).includes(user.id);

  // "Copy WhatsApp update": real records only, per hub and for the club.
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
  const whatsapp = (hub: string | null) => {
    const wins = ((done.data ?? []) as unknown as { title: string; user_id: string; mission: { title: string; hubs: string[] } | null }[])
      .filter((c) => !hub || c.mission?.hubs.includes(hub)).slice(0, 8)
      .map((c) => `✅ ${c.title} (${people.get(c.user_id)?.full_name.split(" ")[0] ?? "a member"})`);
    const next = ((upcoming.data ?? []) as { title: string; mission_date: string; hubs: string[] }[]).filter((m) => !hub || m.hubs.includes(hub)).map((m) => `📌 ${m.title} · ${dayLabel(m.mission_date)}`);
    const dl = due.filter((d) => !hub || d.hub === hub).slice(0, 8).map((d) => `⏰ ${d.title} · ${dayLabel(d.due_on)}${d.assignee_id ? ` (${people.get(d.assignee_id)?.full_name.split(" ")[0] ?? ""})` : ""}`);
    return [`*FusionX${hub ? ` · ${hubLabel(hub)}` : ""} · this week*`, "",
      ...(wins.length ? ["Done this week:", ...wins, ""] : []),
      ...(next.length ? ["Coming up:", ...next, ""] : []),
      ...(dl.length ? ["Deadlines:", ...dl, ""] : []),
      `Your tasks: ${site}/my-work`].join("\n");
  };
  const hubsForCopy = viewer.operator ? HUBS.map((h) => h.slug) : viewer.leadHubs;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="waiting" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="waiting" className="font-serif text-xl text-ink">Waiting for you ({items.length})</h2>
          {safeCount > 0 && <ApproveAllSafe count={safeCount} />}
        </div>
        <p className="mt-1 text-sm text-ink/60">Autopilot prepared these in Suggest mode. One click carries one out. Safe ones: reminders, offers, re-offers and digests.</p>
        {items.length === 0 ? (
          <p className="mt-4 border border-dashed border-line p-4 text-sm text-ink/70" data-today-empty>
            Nothing is waiting. Autopilot checks every 15 minutes. One optional step:{" "}
            {(exams.data ?? []).length === 0 ? <>add your club exam dates below, so missions move out of them.</> : <>switch safe areas to Auto in Control.</>}
          </p>
        ) : (
          <ul className="mt-4 space-y-2" data-today-list>
            {items.map((i) => (
              <QueueItem key={i.id} item={i} members={memberOptions} variations={((variations.data ?? []) as { playbook_id: string; key: string; name: string }[])} />
            ))}
          </ul>
        )}

        <h2 className="mt-8 font-serif text-xl text-ink">This week&apos;s deadlines</h2>
        {due.length === 0 ? <p className="mt-2 text-sm text-ink/60">No deadlines in the next 7 days.</p> : (
          <ul className="mt-3 divide-y divide-line border border-line">
            {due.map((d) => (
              <li key={d.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/command/missions?m=${d.mission!.id}`} className="min-w-0 text-ink hover:underline">{d.title}<span className="block truncate text-xs text-ink/60">{d.mission!.title}</span></Link>
                <span className={cn("shrink-0 text-xs", daysFromToday(d.due_on) <= 1 ? "font-semibold text-ink" : "text-ink/60")}>
                  {dayLabel(d.due_on)} · {d.assignee_id ? people.get(d.assignee_id)?.full_name ?? "someone" : "not taken yet"} · {TASK_STATUS_LABEL[d.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-5">
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Quick actions</h2>
          <div className="mt-3 flex flex-col gap-2">
            <StartMission playbooks={(playbooks.data ?? []) as { id: string; name: string; default_visibility: string }[]} variations={(variations.data ?? []) as { playbook_id: string; key: string; name: string; is_default: boolean }[]} members={memberOptions} />
            <Link href="/command/missions" className="text-sm text-accent-text underline">Run a pitch vote (with pitches, in People)</Link>
            {viewer.superAdmin && <MasterButton on={settings.data?.master !== "paused"} />}
            {viewer.admin && <FounderExamToggle userId={user.id} on={founderMode} current={(settings.data?.founder_exam_mode as string[] | undefined) ?? []} />}
          </div>
        </section>
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Club exam periods</h2>
          <p className="mt-1 text-xs text-ink/60">Only exam-safe playbooks run then; other missions move after them.</p>
          <ExamPeriods rows={(exams.data ?? []) as { id: string; name: string; starts_on: string; ends_on: string }[]} canEdit={viewer.operator} />
        </section>
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">My tasks</h2>
          {(myTasks.data ?? []).length === 0 ? <p className="mt-2 text-sm text-ink/60">None.</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {((myTasks.data ?? []) as unknown as { id: string; title: string; due_on: string; status: string }[]).map((t) => (
                <li key={t.id} className="flex justify-between gap-2"><Link href="/my-work" className="text-ink hover:underline">{t.title}</Link><span className="shrink-0 text-xs text-ink/60">{dayLabel(t.due_on)}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">WhatsApp update</h2>
          <p className="mt-1 text-xs text-ink/60">Made from this week&apos;s records. Copy, then paste it in the group.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {viewer.operator && <CopyText label="Whole club" text={whatsapp(null)} />}
            {hubsForCopy.map((h) => <CopyText key={h} label={hubLabel(h)} text={whatsapp(h)} />)}
          </div>
        </section>
      </aside>
    </div>
  );
}
