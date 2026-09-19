import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resources", description: "Curated resources for building, research, and competitions." };

export default async function ResourcesPage() {
  const supabase = await createClient();
  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, description, category, url")
    .eq("is_published", true)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  return (
    <Section className="pt-16 pb-24">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Resources</p>
      <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink mb-8">Curated resources.</h1>
      {resources && resources.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {resources.map((r) => (
            <a
              key={r.id}
              href={r.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-ink/10 rounded-sm p-6 bg-surface block hover:border-ink/25 transition-colors"
            >
              <Badge>{r.category}</Badge>
              <p className="mt-3 font-medium text-ink">{r.title}</p>
              {r.description && <p className="mt-1.5 text-sm text-ink/55">{r.description}</p>}
            </a>
          ))}
        </div>
      ) : (
        <EmptyState title="No resources published yet." description="Guides, templates, and references will appear here." />
      )}
    </Section>
  );
}
