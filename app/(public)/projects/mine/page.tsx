import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { dayLabel } from "@/lib/autopilot/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Projects" };

// Active: still going; Done: completed; Archived: continued elsewhere.
const FILTERS = { active: "Active", done: "Done", archived: "Archived" } as const;
const inFilter = (status: string, f: keyof typeof FILTERS) => (f === "done" ? status === "completed" : f === "archived" ? status === "continued" : !["completed", "continued"].includes(status));

export default async function MyProjectsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const filter = (show && show in FILTERS ? show : "active") as keyof typeof FILTERS;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects/mine");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, is_published, updated_at, tracked, mission_id")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  const ids = (projects ?? []).map((p) => p.id as string);
  // Tracking (migration 0043): progress, the next milestone and the team. Empty before it.
  const [{ data: milestones }, { data: members }] = ids.length
    ? await Promise.all([
        supabase.from("project_milestones").select("project_id, title, due_on, done_at").in("project_id", ids).order("due_on", { nullsFirst: false }),
        supabase.from("project_members").select("project_id, user_id").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const list = (projects ?? []).filter((p) => inFilter(p.status as string, filter));

  return (
    <Section className="pt-16 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <SectionHeading eyebrow="My Projects" title="Projects you own." />
        <LinkButton href="/projects/new" size="sm">
          New project
        </LinkButton>
      </div>
      <nav aria-label="Filter" className="mb-6 flex gap-2 text-sm">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
          <Link key={f} href={`/projects/mine?show=${f}`} className={cn("border px-3 py-1", filter === f ? "border-ink text-ink" : "border-line text-ink/70")}>{FILTERS[f]}</Link>
        ))}
      </nav>

      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map((p) => {
            const ms = (milestones ?? []).filter((m) => m.project_id === p.id);
            const done = ms.filter((m) => m.done_at).length;
            const next = ms.find((m) => !m.done_at);
            const team = 1 + (members ?? []).filter((m) => m.project_id === p.id).length;
            return (
              <div key={p.id} className="border border-ink/10 rounded-sm p-5 bg-surface" data-project-card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/projects/${p.id}/edit`} className="font-medium text-ink hover:underline">{p.title}</Link>
                  <div className="flex items-center gap-2">
                    <Badge>{p.status}</Badge>
                    <Badge>{p.is_published ? "published" : "draft"}</Badge>
                    {p.mission_id && <Badge>FusionX support</Badge>}
                  </div>
                </div>
                {ms.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-ink/10"><div className="h-full bg-accent" style={{ width: `${(100 * done) / ms.length}%` }} /></div>
                    <p className="mt-1 text-xs text-ink/60">{done}/{ms.length} milestones{next ? ` · next: ${next.title}${next.due_on ? ` · ${dayLabel(next.due_on as string)}` : ""}` : ""} · team of {team}</p>
                  </div>
                )}
                <div className="mt-3 flex gap-4 text-sm">
                  <Link href={`/projects/${p.id}/work`} className="text-accent-text underline">{p.tracked ? "Milestones and tasks" : "Add a plan"}</Link>
                  <Link href={`/projects/${p.id}/edit`} className="text-ink/70 underline">Edit</Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={filter === "active" ? "You haven't created any projects yet." : `No ${FILTERS[filter].toLowerCase()} projects.`}
          description="Start one to track it from idea through to completion."
        />
      )}
    </Section>
  );
}
