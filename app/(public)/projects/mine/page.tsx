import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Projects" };

export default async function MyProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects/mine");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, is_published, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <Section className="pt-16 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <SectionHeading eyebrow="My Projects" title="Projects you own." />
        <LinkButton href="/projects/new" size="sm">
          New project
        </LinkButton>
      </div>

      {projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/edit`}
              className="border border-ink/10 rounded-sm p-5 bg-surface flex items-center justify-between hover:border-ink/25 transition-colors"
            >
              <p className="font-medium text-ink">{p.title}</p>
              <div className="flex items-center gap-2">
                <Badge>{p.status}</Badge>
                <Badge>{p.is_published ? "published" : "draft"}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="You haven't created any projects yet."
          description="Start one to track it from idea through to completion."
        />
      )}
    </Section>
  );
}