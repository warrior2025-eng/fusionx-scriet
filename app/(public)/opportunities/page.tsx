import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Opportunities",
  description: "Hackathons, competitions, internships, and other opportunities shared by FusionX.",
};

export default async function OpportunitiesPage() {
  const supabase = await createClient();
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, organizer, category, description, deadline, registration_url, status")
    .eq("is_published", true)
    .order("deadline", { ascending: true });

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/95 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute top-0 left-1/3 w-[500px] h-[300px] bg-accent/[0.04] rounded-full blur-[100px]" aria-hidden />

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-3">Opportunities</p>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Hackathons, internships, and more.
            </h1>
            <p className="mt-4 text-sm text-ink/50 max-w-xl leading-relaxed">
              FusionX shares opportunities it becomes aware of. Listing here isn&rsquo;t a guarantee
              of verification — always confirm details on the organizer&rsquo;s official page before
              applying.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        {opportunities && opportunities.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {opportunities.map((o, i) => (
              <ScrollReveal key={o.id} delay={i * 80}>
                <div className="card-elevated rounded-sm p-7 h-full flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Badge>{o.category.replace(/_/g, " ")}</Badge>
                      <Badge>{o.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{o.title}</p>
                    <p className="text-xs uppercase tracking-wider text-ink/40 mt-1 font-medium">{o.organizer}</p>
                    <p className="mt-3 text-sm text-ink/55 line-clamp-3 leading-relaxed">{o.description}</p>
                  </div>
                  <div className="mt-6 pt-5 border-t border-ink/8 flex items-center justify-between gap-4">
                    {o.deadline ? (
                      <p className="text-xs text-ink/45 font-medium">
                        Deadline: {new Date(o.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    ) : <span />}
                    {o.registration_url && (
                      <a
                        href={o.registration_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-accent hover:underline shrink-0"
                      >
                        View details →
                      </a>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState
              title="No opportunities listed yet."
              description="Hackathons, competitions, internships, and other opportunities will appear here as they're published."
            />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
