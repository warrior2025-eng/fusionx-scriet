import type { Metadata } from "next";
import Link from "next/link";
import { ChangePlan, MissionActions, TaskControls, VersionRestore } from "@/components/autopilot/mission-parts";
import { OpenSeatButton, SeatDecision } from "@/components/autopilot/people-parts";
import { dayLabel, daysFromToday, getAutopilotViewer, healthOf, peopleById, proofHref, type MissionRow, type TaskRow } from "@/lib/autopilot/server";
import { EFFORT_LABEL, HUBS, STATUS_LABEL, TASK_STATUS_LABEL, hubLabel, type Health } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center · Missions" };

const COLUMNS = ["planned", "active", "review", "done", "paused"] as const;
const DOT: Record<Health, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };

type Params = Record<string, string | undefined>;

export default async function MissionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;

  let query = supabase.from("missions").select("*").order("mission_date").limit(300);
  if (sp.status) query = query.eq("status", sp.status);
  else query = query.neq("status", "cancelled");
  if (sp.hub) query = query.contains("hubs", [sp.hub]);
  if (sp.playbook) query = query.eq("playbook_id", sp.playbook);
  if (sp.owner) query = query.eq("owner_id", sp.owner);
  if (sp.from) query = query.gte("mission_date", sp.from);
  if (sp.to) query = query.lte("mission_date", sp.to);
  const [{ data: missionData }, { data: playbooks }, { data: variations }] = await Promise.all([
    query,
    supabase.from("playbooks").select("id, name").order("sort"),
    supabase.from("playbook_variations").select("playbook_id, key, name").order("sort"),
  ]);
  let missions = (missionData ?? []) as MissionRow[];
  const ids = missions.map((m) => m.id);
  const [{ data: taskData }, health] = await Promise.all([
    ids.length ? supabase.from("mission_tasks").select("*").in("mission_id", ids).order("sort") : Promise.resolve({ data: [] }),
    healthOf(supabase, ids),
  ]);
  if (sp.health) missions = missions.filter((m) => health.get(m.id) === sp.health);
  const tasks = (taskData ?? []) as TaskRow[];
  const byMission = new Map<string, TaskRow[]>();
  for (const t of tasks) byMission.set(t.mission_id, [...(byMission.get(t.mission_id) ?? []), t]);
  const people = await peopleById(supabase, [...missions.map((m) => m.owner_id), ...tasks.map((t) => t.assignee_id)]);
  const pbName = new Map(((playbooks ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const selected = sp.m ? missions.find((m) => m.id === sp.m) ?? ((await supabase.from("missions").select("*").eq("id", sp.m).maybeSingle()).data as MissionRow | null) : null;

  const progress = (m: MissionRow) => {
    const list = (byMission.get(m.id) ?? []).filter((t) => t.status !== "cancelled");
    const doneCount = list.filter((t) => t.status === "approved").length;
    const next = list.filter((t) => t.status !== "approved").sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
    const folks = [...new Set(list.map((t) => t.assignee_id).filter(Boolean))] as string[];
    return { done: doneCount, total: list.length, next, folks };
  };
  const href = (patch: Params) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/command/missions${p.size ? `?${p}` : ""}`;
  };
  const list = sp.view === "list";

  return (
    <div className="space-y-6">
      {selected && <MissionDetail mission={selected} viewer={viewer} people={people} playbookName={pbName.get(selected.playbook_id ?? "") ?? "No playbook"} variations={((variations ?? []) as { playbook_id: string; key: string; name: string }[]).filter((v) => v.playbook_id === selected.playbook_id)} health={health.get(selected.id) ?? "green"} close={href({ m: undefined })} />}

      <form className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" action="/command/missions">
        <select name="hub" defaultValue={sp.hub ?? ""} className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" aria-label="Hub">
          <option value="">All hubs</option>{HUBS.map((h) => <option key={h.slug} value={h.slug}>{h.label}</option>)}
        </select>
        <select name="playbook" defaultValue={sp.playbook ?? ""} className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" aria-label="Playbook">
          <option value="">All playbooks</option>{((playbooks ?? []) as { id: string; name: string }[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" aria-label="Status">
          <option value="">Any status</option>{[...COLUMNS, "cancelled"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="health" defaultValue={sp.health ?? ""} className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" aria-label="Health">
          <option value="">Any health</option><option value="green">Green</option><option value="amber">Amber</option><option value="red">Red</option>
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""} className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" aria-label="Owner">
          <option value="">Any owner</option>{[...new Set(missions.map((m) => m.owner_id).filter(Boolean))].map((o) => <option key={o!} value={o!}>{people.get(o!)?.full_name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="From" className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" />
        <input type="date" name="to" defaultValue={sp.to} aria-label="To" className="border border-line bg-paper px-2 py-1.5 text-sm text-ink" />
        <input type="hidden" name="view" value={sp.view ?? ""} />
        <button className="border border-ink/30 px-3 py-1.5 text-sm text-ink hover:border-ink">Filter</button>
      </form>
      <div className="flex gap-3 text-sm">
        <Link href={href({ view: undefined })} className={cn(!list && "font-semibold underline")}>Board</Link>
        <Link href={href({ view: "list" })} className={cn(list && "font-semibold underline")}>List</Link>
      </div>

      {missions.length === 0 ? (
        <p className="border border-dashed border-line p-4 text-sm text-ink/70">No missions match. Approve the prepared ones in Today, or start one there.</p>
      ) : list ? (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink/60"><tr><th className="p-2">Mission</th><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2">Progress</th><th className="p-2">Next deadline</th><th className="p-2">Owner</th></tr></thead>
            <tbody className="divide-y divide-line">
              {missions.map((m) => { const p = progress(m); return (
                <tr key={m.id}>
                  <td className="p-2"><span className={cn("mr-2 inline-block h-2 w-2 rounded-full", DOT[health.get(m.id) ?? "green"])} aria-label={health.get(m.id)} /><Link href={href({ m: m.id })} className="text-ink hover:underline">{m.title}</Link></td>
                  <td className="p-2">{dayLabel(m.mission_date)}</td><td className="p-2">{STATUS_LABEL[m.status]}</td><td className="p-2">{p.done}/{p.total}</td>
                  <td className="p-2">{p.next ? `${p.next.title} · ${dayLabel(p.next.due_on)}` : "—"}</td><td className="p-2">{people.get(m.owner_id ?? "")?.full_name ?? "—"}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5" data-board>
          {COLUMNS.map((col) => (
            <section key={col} className="min-w-0 border border-line bg-surface/60 p-2" aria-label={STATUS_LABEL[col]}>
              <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">{STATUS_LABEL[col]} ({missions.filter((m) => m.status === col).length})</h2>
              <ul className="space-y-2">
                {missions.filter((m) => m.status === col).map((m) => { const p = progress(m); const h = health.get(m.id) ?? "green"; return (
                  <li key={m.id}>
                    <Link href={href({ m: m.id })} className="block border border-line bg-paper p-2.5 hover:border-ink/40" data-mission-card={h}>
                      <p className="flex items-start gap-2 text-sm font-medium text-ink"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[h])} aria-label={`${h} health`} />{m.title}</p>
                      <div className="mt-2 h-1.5 bg-ink/10" role="progressbar" aria-valuenow={p.done} aria-valuemax={p.total} aria-label="Progress"><div className="h-full bg-accent" style={{ width: `${p.total ? (100 * p.done) / p.total : 0}%` }} /></div>
                      <p className="mt-1.5 text-xs text-ink/60">{p.done}/{p.total} done{p.next ? ` · next ${dayLabel(p.next.due_on)}` : ""}</p>
                      <p className="text-xs text-ink/60">{m.hubs.map(hubLabel).join(", ")}{p.folks.length ? ` · ${p.folks.length} people` : ""}</p>
                    </Link>
                  </li>
                ); })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

async function MissionDetail({ mission: m, viewer, people, playbookName, variations, health, close }: {
  mission: MissionRow; viewer: NonNullable<Awaited<ReturnType<typeof getAutopilotViewer>>>; people: Map<string, { full_name: string }>;
  playbookName: string; variations: { key: string; name: string }[]; health: Health; close: string;
}) {
  const { supabase } = viewer;
  const [{ data: taskData }, { data: versions }, { data: hubMembers }, { data: seats }] = await Promise.all([
    supabase.from("mission_tasks").select("*").eq("mission_id", m.id).order("due_on").order("sort"),
    supabase.from("mission_versions").select("version, reason, changed_by, created_at").eq("mission_id", m.id).order("version", { ascending: false }),
    supabase.from("core_group_members").select("user_id, group:core_groups(slug)"),
    // Open seats and who applied (migration 0043; empty before it).
    supabase.from("open_seats").select("id, task_id, status, applications:seat_applications(id, user_id, pitch, previous_work, status)").eq("mission_id", m.id),
  ]);
  type Seat = { id: string; task_id: string; status: string; applications: { id: string; user_id: string; pitch: string; previous_work: string | null; status: string }[] };
  const seatRows = (seats ?? []) as unknown as Seat[];
  const tasks = (taskData ?? []) as TaskRow[];
  const extra = await peopleById(supabase, [...tasks.map((t) => t.assignee_id), ...((versions ?? []) as { changed_by: string | null }[]).map((v) => v.changed_by), ...((hubMembers ?? []) as { user_id: string }[]).map((h) => h.user_id), ...seatRows.flatMap((x) => x.applications.map((a) => a.user_id))]);
  const name = (id: string | null) => (id ? extra.get(id)?.full_name ?? people.get(id)?.full_name ?? "someone" : "nobody yet");
  const members = [...new Set(((hubMembers ?? []) as unknown as { user_id: string; group: { slug: string } | null }[]).filter((h) => h.group && m.hubs.includes(h.group.slug)).map((h) => h.user_id))].map((id) => ({ id, name: name(id) })).sort((a, b) => a.name.localeCompare(b.name));
  const proofs = await Promise.all(tasks.map((t) => proofHref(supabase, t.proof_url)));
  const live = tasks.filter((t) => t.status !== "cancelled");

  return (
    <section className="border border-ink/25 bg-surface p-4 sm:p-5" data-mission-detail={m.id} aria-label={m.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink/60">{playbookName}{m.variation_key ? ` · ${variations.find((v) => v.key === m.variation_key)?.name ?? m.variation_key}` : ""} · {m.visibility === "public" ? "public outcome" : "members only"} · v{m.version}</p>
          <h2 className="font-serif text-2xl text-ink">{m.title}</h2>
          <p className="text-sm text-ink/70">{dayLabel(m.mission_date)} · {STATUS_LABEL[m.status]} · health {health} · owner {name(m.owner_id)} · {m.hubs.map(hubLabel).join(", ")}</p>
          {m.goal && <p className="mt-1 text-sm text-ink/80">{m.goal}</p>}
          {m.cancel_reason && <p className="mt-1 text-sm text-ink/70">Cancelled: {m.cancel_reason}</p>}
        </div>
        <Link href={close} className="text-sm underline">Close</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ChangePlan mission={{ id: m.id, variation: m.variation_key, date: m.mission_date, owner: m.owner_id, hubs: m.hubs }} variations={variations} members={members}
          tasks={live.map((t) => ({ id: t.id, title: t.title, status: t.status }))} />
        <MissionActions id={m.id} status={m.status} links={m.outcome_links} />
      </div>

      <h3 className="mt-5 text-sm font-semibold text-ink">Tasks ({live.filter((t) => t.status === "approved").length}/{live.length} done)</h3>
      <ul className="mt-2 divide-y divide-line border border-line">
        {tasks.map((t, i) => (
          <li key={t.id} className={cn("flex flex-col gap-2 p-2.5 text-sm lg:flex-row lg:flex-wrap lg:items-center lg:justify-between", t.status === "cancelled" && "opacity-55")} data-task-row={t.status}>
            <div className="min-w-0">
              <p className="text-ink">{t.title}{t.locked && <span className="ml-2 text-xs text-ink/60">(locked)</span>}</p>
              <p className="text-xs text-ink/60">
                {hubLabel(t.hub)} · {EFFORT_LABEL[t.effort]} · {dayLabel(t.due_on)}
                {daysFromToday(t.due_on) < 0 && !["approved", "cancelled"].includes(t.status) && <span className="font-semibold text-red-600 dark:text-red-400"> · {-daysFromToday(t.due_on)}d late</span>}
                {" "}· {TASK_STATUS_LABEL[t.status]} · {name(t.assignee_id)}
                {proofs[i] && <> · <a href={proofs[i]!} target="_blank" rel="noopener noreferrer" className="underline">proof</a></>}
              </p>
            </div>
            {t.status !== "cancelled" && <TaskControls task={{ id: t.id, status: t.status, locked: t.locked, due: t.due_on, assignee: t.assignee_id }} members={members} />}
            {t.open_seat_allowed && ["open", "offered"].includes(t.status) && !t.assignee_id && !seatRows.some((x) => x.task_id === t.id && x.status === "open") && <div className="w-full basis-full"><OpenSeatButton taskId={t.id} /></div>}
            {seatRows.filter((x) => x.task_id === t.id && x.status === "open").map((x) => (
              <div key={x.id} className="w-full basis-full border-t border-line pt-2 text-xs" data-seat-open>
                <p className="font-semibold text-ink">Open seat · {x.applications.filter((a) => a.status === "pending").length} applied</p>
                {x.applications.filter((a) => a.status === "pending").map((a) => (
                  <div key={a.id} className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-ink/80"><strong>{name(a.user_id)}</strong>: {a.pitch}{a.previous_work && <> · <a href={a.previous_work} target="_blank" rel="noopener noreferrer" className="underline">work</a></>}</span>
                    <SeatDecision applicationId={a.id} />
                  </div>
                ))}
              </div>
            ))}
          </li>
        ))}
      </ul>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Version history ({(versions ?? []).length})</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {((versions ?? []) as { version: number; reason: string | null; changed_by: string | null; created_at: string }[]).map((v, i) => (
            <li key={v.version} className="flex flex-wrap items-center justify-between gap-2">
              <span>v{v.version} · {new Date(v.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {name(v.changed_by)} · {v.reason}</span>
              {i > 0 && <VersionRestore id={m.id} version={v.version} />}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
