import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Research" };

export default async function MyResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/research/mine");

  const { data: entries } = await supabase
    .from("research")
    .select("id, title, status, is_published, updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  return (
    <Section className="pt-16 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <SectionHeading eyebrow="My Research" title="Entries you've written." />
        <LinkButton href="/research/new" size="sm">
          New entry
        </LinkButton>
      </div>

      {entries && entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((r) => (
            <Link
              key={r.id}
              href={`/research/${r.id}/edit`}
              className="border border-ink/10 rounded-sm p-5 bg-surface flex items-center justify-between hover:border-ink/25 transition-colors"
            >
              <p className="font-medium text-ink">{r.title}</p>
              <div className="flex items-center gap-2">
                <Badge>{r.status}</Badge>
                <Badge>{r.is_published ? "published" : "draft"}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="You haven't written any research entries yet." description="Start one to document your work." />
      )}
    </Section>
  );
}
