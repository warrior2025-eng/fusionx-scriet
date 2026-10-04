import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Projects",
  description: "Browse published projects being built by FusionX members.",
};

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
    .select("id, title, slug, description, domain, status, technologies, image_path")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.domain) query = query.eq("domain", params.domain);
  if (params.tech) query = query.contains("technologies", [params.tech]);

  const { data: projects } = await query;

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/95 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute top-0 left-1/3 w-[500px] h-[300px] bg-accent/[0.04] rounded-full blur-[100px]" aria-hidden />

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-3">Projects</p>
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

      <Section className="py-12 md:py-16">
        <ScrollReveal>
          <form className="flex flex-wrap gap-3 mb-10" method="get">
            <input
              type="search"
              name="q"
              placeholder="Search by title…"
              defaultValue={params.q}
              className="rounded-sm border border-ink/15 bg-surface px-4 py-2 text-sm placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-accent/40"
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

        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            {projects.map((p, i) => (
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
