import type { Metadata } from "next";
import Link from "next/link";
import { TaskControls } from "@/components/autopilot/mission-parts";
import { Nominate } from "@/components/autopilot/people-parts";
import { dayLabel, getAutopilotViewer, peopleById, todayIST } from "@/lib/autopilot/server";
import { HUBS, hubLabel } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center · People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const today = todayIST();
  if (sp.view === "community" || sp.view === "collaborators") return <OutsideCore view={sp.view} />;
  const hubs = viewer.operator ? HUBS.map((h) => h.slug) : viewer.leadHubs;

  const [{ data: memberData }, { data: taskData }, { data: offerData }, { data: busyData }, { data: contribData }, { data: reviewData }, { data: settings }] = await Promise.all([
    supabase.from("core_group_members").select("user_id, is_lead, group:core_groups!inner(slug, kind), profile:profiles!inner(full_name, skills, is_active)").eq("group.kind", "hub"),
    supabase.from("mission_tasks").select("id, title, due_on, status, locked, assignee_id, mission:missions(title)").in("status", ["accepted", "changes", "submitted"]),
    supabase.from("task_offers").select("user_id, offered_at, status"),
    supabase.from("availability").select("user_id, starts_on, ends_on").gte("ends_on", today),
    supabase.from("contributions").select("user_id, contributed_on").order("contributed_on", { ascending: false }),
    supabase.from("task_reviews").select("reviewer_id").eq("status", "pending"),
    supabase.from("autopilot_settings").select("numbers").eq("id", 1).maybeSingle(),
  ]);
  const cap = Number((settings?.numbers as Record<string, number> | undefined)?.load_cap ?? 2);
  type M = { user_id: string; is_lead: boolean; group: { slug: string }; profile: { full_name: string; skills: string[]; is_active: boolean } };
  const rows = new Map<string, { id: string; name: string; skills: string[]; hubs: string[]; lead: boolean }>();
  for (const m of (memberData ?? []) as unknown as M[]) {
    if (!m.profile.is_active || !hubs.includes(m.group.slug)) continue;
    const r = rows.get(m.user_id) ?? { id: m.user_id, name: m.profile.full_name, skills: m.profile.skills ?? [], hubs: [], lead: false };
    r.hubs.push(m.group.slug);
    r.lead ||= m.is_lead;
    rows.set(m.user_id, r);
  }
  type T = { id: string; title: string; due_on: string; status: string; locked: boolean; assignee_id: string; mission: { title: string } | null };
  const tasks = (taskData ?? []) as unknown as T[];
  const offers = (offerData ?? []) as { user_id: string; offered_at: string; status: string }[];
  const threeWeeksAgo = new Date(new Date(`${today}T00:00:00+05:30`).getTime() - 21 * 864e5).toISOString();
  const all = [...rows.values()].map((r) => {
    const mine = tasks.filter((t) => t.assignee_id === r.id);
    const open = mine.filter((t) => t.status !== "submitted").length + offers.filter((o) => o.user_id === r.id && o.status === "offered").length;
    const lastOffer = offers.filter((o) => o.user_id === r.id).map((o) => o.offered_at).sort().pop();
    const busy = (busyData ?? []).filter((b) => b.user_id === r.id) as { starts_on: string; ends_on: string }[];
    const last = (contribData ?? []).find((c) => c.user_id === r.id)?.contributed_on as string | undefined;
    const reviews = (reviewData ?? []).filter((x) => x.reviewer_id === r.id).length;
    const idle = mine.length === 0 && (!lastOffer || lastOffer < threeWeeksAgo);
    return { ...r, mine, open, busy, last, reviews, idle, over: open >= cap };
  }).filter((r) => (!sp.hub || r.hubs.includes(sp.hub)) && (sp.flag !== "idle" || r.idle) && (sp.flag !== "over" || r.over))
    .sort((a, b) => Number(b.over) - Number(a.over) || Number(b.idle) - Number(a.idle) || a.name.localeCompare(b.name));
  const members = [...rows.values()].map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/command/people${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={link({ hub: undefined })} className={cn("border px-2.5 py-1", !sp.hub ? "border-ink text-ink" : "border-line text-ink/70")}>All hubs</Link>
        {hubs.map((h) => <Link key={h} href={link({ hub: h })} className={cn("border px-2.5 py-1", sp.hub === h ? "border-ink text-ink" : "border-line text-ink/70")}>{hubLabel(h)}</Link>)}
        <span className="mx-1 text-ink/30">|</span>
        <Link href={link({ flag: sp.flag === "idle" ? undefined : "idle" })} className={cn("border px-2.5 py-1", sp.flag === "idle" ? "border-ink text-ink" : "border-line text-ink/70")}>No task for 3+ weeks</Link>
        <Link href={link({ flag: sp.flag === "over" ? undefined : "over" })} className={cn("border px-2.5 py-1", sp.flag === "over" ? "border-ink text-ink" : "border-line text-ink/70")}>Overloaded</Link>
        <span className="mx-1 text-ink/30">|</span>
        <Link href="/command/people?view=community" className="border border-line px-2.5 py-1 text-ink/70">Community</Link>
        <Link href="/command/people?view=collaborators" className="border border-line px-2.5 py-1 text-ink/70">Collaborators</Link>
      </div>
      {all.length === 0 ? <p className="border border-dashed border-line p-4 text-sm text-ink/70">No hub members here yet. Add people to the hubs in Admin → Core.</p> : (
        <ul className="divide-y divide-line border border-line" data-people>
          {all.map((p) => (
            <li key={p.id} className="p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="font-medium text-ink">{p.name}{p.lead && <span className="ml-2 text-xs text-ink/60">lead</span>}
                  {p.over && <span className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-400">overloaded</span>}
                  {p.idle && <span className="ml-2 text-xs font-semibold text-ink/70">no task for 3+ weeks</span>}</p>
                <p className="text-xs text-ink/60">load {p.open}/{cap} · {p.reviews} review{p.reviews === 1 ? "" : "s"} waiting · last contribution {p.last ? dayLabel(p.last) : "none yet"}</p>
              </div>
              <p className="text-xs text-ink/60">{p.hubs.map(hubLabel).join(", ")}{p.skills.length ? ` · ${p.skills.slice(0, 6).join(", ")}` : ""}{p.busy.length ? ` · busy ${p.busy.map((b) => `${b.starts_on}→${b.ends_on}`).join(", ")}` : ""}</p>
              {p.mine.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {p.mine.map((t) => (
                    <li key={t.id} className="flex flex-col gap-1 border-l-2 border-line pl-2 text-sm lg:flex-row lg:items-center lg:justify-between">
                      <span>{t.title} <span className="text-xs text-ink/60">· {t.mission?.title} · {dayLabel(t.due_on)}</span></span>
                      {t.status !== "submitted" && <TaskControls task={{ id: t.id, status: t.status, locked: t.locked, due: t.due_on, assignee: t.assignee_id }} members={members.filter((m) => m.id !== p.id)} />}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Community members with verified work, and Core Collaborators (migration 0043). */
async function OutsideCore({ view }: { view: "community" | "collaborators" }) {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const tabs = (
    <div className="flex flex-wrap gap-2 text-sm">
      <Link href="/command/people" className="border border-line px-2.5 py-1 text-ink/70">Hub members</Link>
      <Link href="/command/people?view=community" className={cn("border px-2.5 py-1", view === "community" ? "border-ink text-ink" : "border-line text-ink/70")}>Community</Link>
      <Link href="/command/people?view=collaborators" className={cn("border px-2.5 py-1", view === "collaborators" ? "border-ink text-ink" : "border-line text-ink/70")}>Collaborators</Link>
    </div>
  );
  if (view === "collaborators") {
    const { data } = await supabase.from("collaborators").select("id, user_id, mission_ids, core_group_id, starts_on, ends_on, status, shortlisted").order("ends_on", { ascending: false });
    const rows = (data ?? []) as { id: string; user_id: string; mission_ids: string[]; starts_on: string; ends_on: string; status: string; shortlisted: boolean }[];
    const names = await peopleById(supabase, rows.map((r) => r.user_id));
    return (
      <div className="space-y-4">{tabs}
        {rows.length === 0 ? <p className="border border-dashed border-line p-4 text-sm text-ink/70">No Core Collaborators yet. Rising Talent suggestions appear in Today; approving one makes a collaborator.</p> : (
          <ul className="divide-y divide-line border border-line text-sm" data-collaborators>
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span className="text-ink">{names.get(r.user_id)?.full_name}{r.shortlisted && <span className="ml-2 text-xs text-ink/60">recommended by FusionX Core (admins only)</span>}</span>
                <span className="text-xs text-ink/60">{r.status} · {r.starts_on} → {r.ends_on} · {r.mission_ids.length} mission{r.mission_ids.length === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const [{ data: contribs }, { data: core }] = await Promise.all([
    supabase.from("contributions").select("user_id, contributed_on").eq("counts", true),
    supabase.from("core_group_members").select("user_id, title"),
  ]);
  const coreIds = new Set(((core ?? []) as { user_id: string; title: string }[]).filter((c) => c.title !== "Collaborator").map((c) => c.user_id));
  const byUser = new Map<string, { n: number; last: string }>();
  for (const c of (contribs ?? []) as { user_id: string; contributed_on: string }[]) {
    if (coreIds.has(c.user_id)) continue;
    const cur = byUser.get(c.user_id) ?? { n: 0, last: c.contributed_on };
    byUser.set(c.user_id, { n: cur.n + 1, last: cur.last > c.contributed_on ? cur.last : c.contributed_on });
  }
  const names = await peopleById(supabase, [...byUser.keys()]);
  const rows = [...byUser.entries()].sort((a, b) => b[1].n - a[1].n);
  return (
    <div className="space-y-4">{tabs}
      {rows.length === 0 ? <p className="border border-dashed border-line p-4 text-sm text-ink/70">No community contributions yet. They come from open seats and community tasks.</p> : (
        <ul className="divide-y divide-line border border-line text-sm" data-community>
          {rows.map(([id, r]) => (
            <li key={id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-ink">{names.get(id)?.full_name} <span className="text-xs text-ink/60">· {r.n} verified contribution{r.n === 1 ? "" : "s"} · last {r.last}</span></span>
              <Nominate userId={id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
