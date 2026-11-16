import type { Metadata } from "next";
import { pageMetadata } from "@/lib/data/seo";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { JoinProject } from "@/components/autopilot/join-project";
import { Toaster } from "@/components/admin/toast";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("projects", { title: "Projects", description: "Browse published projects being built by FusionX members." });

const statuses = ["idea", "building", "prototype", "testing", "completed", "continued"] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; domain?: string; tech?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("id, title, slug, description, domain, status, technologies, image_path, idea_id, owner_id")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.domain) query = query.eq("domain", params.domain);
  if (params.tech) query = query.contains("technologies", [params.tech]);

  const { data: projects } = await query;
  // Autopilot (migration 0045): started from an idea, or open for a team; empty before it.
  const [{ data: metaRows }, { data: auth }] = await Promise.all([
    projects?.length ? supabase.rpc("ap_public_project_meta", { p_ids: projects.map((p) => p.id) }) : Promise.resolve({ data: [] }),
    supabase.auth.getUser(),
  ]);
  type Meta = { project_id: string; started_by: string; from_idea: boolean; open_for_team: boolean; joins_closed: boolean; teams: number };
  const meta = new Map(((metaRows ?? []) as Meta[]).map((m) => [m.project_id, m]));
  // The teams I am in (so the card says "You're in" with Leave, instead of Join).
  const myTeams = new Set<string>();
  const myRequests = new Set<string>(); // waiting for the owner's Accept (migration 0049)
  if (auth.user && projects?.length) {
    const pids = projects.map((p) => p.id);
    const [{ data: mine }, { data: asked }] = await Promise.all([
      supabase.from("project_members").select("project_id").eq("user_id", auth.user.id).in("project_id", pids),
      supabase.from("project_join_requests").select("project_id").eq("user_id", auth.user.id).eq("status", "pending").in("project_id", pids),
    ]);
    for (const r of mine ?? []) myTeams.add(r.project_id as string);
    for (const r of asked ?? []) myRequests.add(r.project_id as string);
  }
  const me = auth.user?.id;
  // Projects started from the same idea share one card, with every team listed on it.
  const groups: { lead: NonNullable<typeof projects>[number]; teams: NonNullable<typeof projects> }[] = [];
  const byIdea = new Map<string, number>();
  for (const p of projects ?? []) {
    const key = (p as { idea_id?: string | null }).idea_id;
    if (key && byIdea.has(key)) groups[byIdea.get(key)!].teams.push(p);
    else { if (key) byIdea.set(key, groups.length); groups.push({ lead: p, teams: [p] }); }
  }

  return (
    <>
      <Toaster />
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Projects</Eyebrow>
                <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
                  What members are building.
                </h1>
              </div>
              <div className="flex gap-2.5">
                <LinkButton href="/projects/mine" variant="secondary" size="sm">
                  My projects
                </LinkButton>
                <LinkButton href="/projects/new" size="sm">
                  New project
                </LinkButton>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        <ScrollReveal>
          <form className="flex flex-wrap gap-3 mb-10" method="get">
            <input
              type="search"
              name="q"
              placeholder="Search by title…"
              defaultValue={params.q}
              className="rounded-sm border border-ink/15 bg-surface px-4 py-2 text-sm placeholder:text-ink/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-sm border border-ink/15 bg-surface px-4 py-2 text-sm text-ink/75 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="rounded-sm border border-ink/20 px-5 py-2 text-sm font-medium hover:border-ink/50 transition-colors">
              Filter
            </button>
          </form>
        </ScrollReveal>

        {groups.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            {groups.map(({ lead: p, teams }, i) => (
              <ScrollReveal key={p.id} delay={i * 70}>
                <div className="card-elevated rounded-sm overflow-hidden h-full flex flex-col justify-between group">
                  <div>
                    {p.image_path && (
                      <div className="h-44 w-full overflow-hidden bg-ink/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.image_path}
                          alt=""
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <Badge>{p.status}</Badge>
                        {p.domain && <span className="text-xs uppercase tracking-wider text-ink/40">{p.domain}</span>}
                      </div>
                      <p className="font-serif text-lg font-medium text-ink group-hover:text-accent transition-colors">
                        {p.title}
                      </p>
                      <p className="mt-2 text-sm text-ink/55 line-clamp-3 leading-relaxed">{p.description}</p>
                      {teams.length > 1 && (
                        <div className="mt-3" data-project-meta data-idea-teams-list>
                          <p className="text-xs font-semibold text-accent-text">{teams.length} teams are building this</p>
                          <ul className="mt-2 divide-y divide-line border-y border-line">
                            {teams.map((t) => {
                              const m = meta.get(t.id);
                              const who = m?.started_by || "a member";
                              return (
                                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-idea-team>
                                  <span className="min-w-0 text-sm text-ink/80">
                                    <span className="font-semibold text-ink">{m?.open_for_team ? "Open team" : `Started by ${who}`}</span>
                                    <span className="text-ink/60"> · {t.status}{m?.joins_closed ? " · full" : ""}</span>
                                  </span>
                                  {m && (!m.joins_closed || myTeams.has(t.id) || t.owner_id === me) && <JoinProject id={t.id} signedIn={!!auth.user} label="Ask to join" ariaLabel={m.open_for_team ? "Ask to join the open team" : `Ask to join ${who}'s team`} joined={myTeams.has(t.id)} owner={t.owner_id === me} requested={myRequests.has(t.id)} />}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {teams.length === 1 && (() => {
                        const m = meta.get(p.id);
                        if (!m || !(m.open_for_team || m.from_idea)) return null;
                        return (
                          <div className="mt-3 space-y-2" data-project-meta>
                            <p className="text-xs font-semibold text-accent-text">{m.open_for_team ? "Open project · looking for a team" : `In progress · Started by ${m.started_by || "a member"}`}</p>
                            {m.teams > 1 && <p className="text-xs text-ink/65">{m.teams} teams are building this</p>}
                            {(!m.joins_closed || myTeams.has(p.id) || p.owner_id === me) && <JoinProject id={p.id} signedIn={!!auth.user} label="Ask to join" joined={myTeams.has(p.id)} owner={p.owner_id === me} requested={myRequests.has(p.id)} />}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {p.technologies?.length > 0 && (
                    <div className="px-6 pb-6 pt-2 border-t border-ink/8 flex flex-wrap gap-1.5">
                      {p.technologies.slice(0, 4).map((t: string) => (
                        <span key={t} className="text-xs text-ink/50 bg-ink/5 border border-ink/10 rounded-full px-2.5 py-0.5 font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState
              title="No projects published yet."
              description="FusionX projects will appear here as ideas move into development. Signed-in members can start one from their dashboard."
            />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
