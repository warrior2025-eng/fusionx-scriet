import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Resources",
  description: "Curated resources for building, research, and competitions.",
};

export default async function ResourcesPage() {
  const supabase = await createClient();
  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, description, category, url")
    .eq("is_published", true)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Resources</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Curated resources.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        {resources && resources.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {resources.map((r, i) => (
              <ScrollReveal key={r.id} delay={i * 80}>
                <a
                  href={r.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-elevated rounded-sm p-7 block group h-full"
                >
                  <Badge>{r.category}</Badge>
                  <p className="mt-4 font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">
                    {r.title}
                  </p>
                  {r.description && <p className="mt-2 text-sm text-ink/55 leading-relaxed">{r.description}</p>}
                </a>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState title="No resources published yet." description="Guides, templates, and references will appear here." />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
