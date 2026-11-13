import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { AddMilestone, AddProjectTask, MilestoneControls, ProjectPlanForm, ProjectStatusOverride, ProjectTaskControls, SupportRequest } from "@/components/autopilot/people-parts";
import { dayLabel, daysFromToday, peopleById } from "@/lib/autopilot/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Project work" };

/**
 * Tracking for a member's own project (migration 0043), for its owner and team: milestones, tasks,
 * progress, proof, activity, Change plan. The project itself stays as /projects/[id]/edit made it.
 */
export default async function ProjectWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=/projects/${id}/work`);
  const [{ data: project }, { data: isTeam }] = await Promise.all([
    supabase.from("projects").select("id, title, status, owner_id, tracked, plan_variation, target_date, status_locked, mission_id, github_url, demo_url").eq("id", id).maybeSingle(),
    supabase.rpc("ap_project_member", { p_project: id, p_user: auth.user.id }),
  ]);
  if (!project || !isTeam) notFound();
  const [{ data: milestones }, { data: tasks }, { data: activity }, { data: members }, { data: support }] = await Promise.all([
    supabase.from("project_milestones").select("id, title, due_on, done_at, proof_url").eq("project_id", id).order("due_on", { nullsFirst: false }).order("sort"),
    supabase.from("project_tasks").select("id, title, milestone_id, assignee_id, due_on, done_at, mission_task_id").eq("project_id", id).order("due_on", { nullsFirst: false }),
    supabase.from("project_activity").select("id, user_id, text, at").eq("project_id", id).order("at", { ascending: false }).limit(30),
    supabase.from("project_members").select("user_id").eq("project_id", id),
    supabase.from("project_support_requests").select("status, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  type M = { id: string; title: string; due_on: string | null; done_at: string | null; proof_url: string | null };
  type T = { id: string; title: string; milestone_id: string | null; assignee_id: string | null; due_on: string | null; done_at: string | null; mission_task_id: string | null };
  const ms = (milestones ?? []) as M[];
  const ts = (tasks ?? []) as T[];
  const teamIds = [project.owner_id as string, ...((members ?? []) as { user_id: string }[]).map((m) => m.user_id)];
  const names = await peopleById(supabase, [...teamIds, ...ts.map((t) => t.assignee_id), ...((activity ?? []) as { user_id: string | null }[]).map((a) => a.user_id)]);
  const team = [...new Set(teamIds)].map((u) => ({ id: u, name: names.get(u)?.full_name ?? "Member" }));
  const done = ms.filter((m) => m.done_at).length;
  const next = ms.find((m) => !m.done_at);
  const owner = project.owner_id === auth.user.id;
  const lastSupport = (support ?? [])[0] as { status: string } | undefined;

  return (
    <Section className="max-w-4xl pb-24 pt-12">
      <Toaster />
      <Link href="/projects/mine" className="text-sm underline">← My projects</Link>
      <Eyebrow>Project work</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink">{project.title}</h1>
      <p className="mt-1 text-sm text-ink/70">
        {project.status} · {project.mission_id ? "supported by FusionX: reviewed work counts" : "personal: self-tracked, not counted for certificates or impact"}
        {project.target_date ? ` · target ${dayLabel(project.target_date as string)}` : ""}
      </p>
      <div className="mt-4" aria-label="Progress">
        <div className="h-2 bg-ink/10" role="progressbar" aria-valuenow={done} aria-valuemax={ms.length}><div className="h-full bg-accent" style={{ width: `${ms.length ? (100 * done) / ms.length : 0}%` }} /></div>
        <p className="mt-1 text-xs text-ink/60">{done}/{ms.length} milestones{next ? ` · next: ${next.title}${next.due_on ? ` · ${dayLabel(next.due_on)}` : ""}` : ""}</p>
      </div>

      <div className="mt-8 grid gap-5">
        {owner && (
          <section className="border border-line bg-surface p-4">
            <h2 className="font-serif text-lg text-ink">{project.tracked ? "Change plan" : "Add a plan"}</h2>
            <p className="mb-3 text-xs text-ink/60">The Flagship sprint&apos;s steps, counted back from your target date. You see what moves before you apply; done milestones stay.</p>
            <ProjectPlanForm projectId={id} variation={(project.plan_variation as string | null) ?? null} target={(project.target_date as string | null) ?? null} />
          </section>
        )}

        <section className="border border-line bg-surface p-4" data-milestones>
          <h2 className="font-serif text-lg text-ink">Milestones</h2>
          <ul className="mt-3 space-y-3">
            {ms.map((m) => (
              <li key={m.id} className="border-l-2 border-line pl-3">
                <p className={cn("text-sm", m.done_at ? "text-ink/60 line-through" : "text-ink")}>{m.title}
                  <span className="ml-2 text-xs text-ink/60 no-underline">{m.due_on ? dayLabel(m.due_on) : ""}{m.due_on && !m.done_at && daysFromToday(m.due_on) < 0 ? " · past its date" : ""}</span>
                  {m.proof_url && <a href={m.proof_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs underline">proof</a>}</p>
                <div className="mt-1.5"><MilestoneControls projectId={id} id={m.id} done={!!m.done_at} /></div>
                <ul className="mt-1.5 space-y-1">
                  {ts.filter((t) => t.milestone_id === m.id).map((t) => <TaskLine key={t.id} t={t} name={names.get(t.assignee_id ?? "")?.full_name} projectId={id} />)}
                </ul>
              </li>
            ))}
          </ul>
          <div className="mt-4"><AddMilestone projectId={id} /></div>
        </section>

        <section className="border border-line bg-surface p-4" data-project-tasks>
          <h2 className="font-serif text-lg text-ink">Tasks</h2>
          <ul className="mt-2 space-y-1">{ts.filter((t) => !t.milestone_id).map((t) => <TaskLine key={t.id} t={t} name={names.get(t.assignee_id ?? "")?.full_name} projectId={id} />)}</ul>
          <div className="mt-3"><AddProjectTask projectId={id} milestones={ms.filter((m) => !m.done_at).map((m) => ({ id: m.id, title: m.title }))} team={team} /></div>
          <p className="mt-2 text-xs text-ink/60">Teammates join through the project team, as before. Their tasks show on My work with reminders.</p>
        </section>

        {owner && (
          <section className="border border-line bg-surface p-4">
            <h2 className="font-serif text-lg text-ink">Status and support</h2>
            <p className="mb-2 text-xs text-ink/60">Progress sets the status (first milestone: building; all done with a repo or demo link: completed) unless you set it by hand.</p>
            <ProjectStatusOverride projectId={id} status={project.status as string} locked={project.status_locked as boolean} />
            <div className="mt-4">
              {project.mission_id ? <p className="text-sm text-ink/70">FusionX supports this project. Publishing on /projects stays an admin decision.</p>
                : lastSupport?.status === "pending" ? <p className="text-sm text-ink/70">Support requested. A lead or admin decides.</p>
                : <SupportRequest projectId={id} />}
            </div>
          </section>
        )}

        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Activity</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {((activity ?? []) as { id: string; user_id: string | null; text: string; at: string }[]).map((a) => (
              <li key={a.id}><span className="text-ink">{a.text}</span> <span className="text-xs text-ink/60">· {a.user_id ? names.get(a.user_id)?.full_name : "FusionX"} · {new Date(a.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </Section>
  );
}

function TaskLine({ t, name, projectId }: { t: { id: string; title: string; due_on: string | null; done_at: string | null; mission_task_id: string | null }; name?: string; projectId: string }) {
  return (
    <li className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className={t.done_at ? "text-ink/55 line-through" : "text-ink"}>{t.title} <span className="text-xs text-ink/60 no-underline">· {name ?? "nobody yet"}{t.due_on ? ` · ${dayLabel(t.due_on)}` : ""}</span></span>
      <ProjectTaskControls projectId={projectId} id={t.id} done={!!t.done_at} supported={!!t.mission_task_id} />
    </li>
  );
}
