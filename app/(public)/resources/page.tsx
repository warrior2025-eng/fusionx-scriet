import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

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
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/95 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute top-0 left-1/3 w-[500px] h-[300px] bg-accent/[0.04] rounded-full blur-[100px]" aria-hidden />

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-3">Resources</p>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Curated resources.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section className="py-12 md:py-16">
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
