import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
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
    .select("id, title, slug, description, domain, status, technologies")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.domain) query = query.eq("domain", params.domain);
  if (params.tech) query = query.contains("technologies", [params.tech]);

  const { data: projects } = await query;

  return (
    <>
      <Section className="pt-16 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Projects</p>
            <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">
              What members are building.
            </h1>
          </div>
          <div className="flex gap-2">
            <LinkButton href="/projects/mine" variant="secondary" size="sm">
              My projects
            </LinkButton>
            <LinkButton href="/projects/new" size="sm">
              New project
            </LinkButton>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <form className="flex flex-wrap gap-3 mb-10" method="get">
          <input
            type="search"
            name="q"
            placeholder="Search by title…"
            defaultValue={params.q}
            className="rounded-sm border border-ink/15 bg-surface px-3.5 py-2 text-sm placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-sm border border-ink/15 bg-surface px-3.5 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="rounded-sm border border-ink/20 px-4 py-2 text-sm font-medium hover:border-ink/50">
            Filter
          </button>
        </form>

        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div key={p.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <Badge>{p.status}</Badge>
                  {p.domain && <span className="text-xs text-ink/40">{p.domain}</span>}
                </div>
                <p className="font-medium text-ink">{p.title}</p>
                <p className="mt-1.5 text-sm text-ink/55 line-clamp-3">{p.description}</p>
                {p.technologies?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.technologies.slice(0, 4).map((t: string) => (
                      <span key={t} className="text-xs text-ink/45 border border-ink/10 rounded-full px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No projects published yet."
            description="FusionX projects will appear here as ideas move into development. Signed-in members can start one from their dashboard."
          />
        )}
      </Section>
    </>
  );
}