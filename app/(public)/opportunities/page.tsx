import type { Metadata } from "next";
import { pageMetadata } from "@/lib/data/seo";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ArrowRight } from "lucide-react";
import { linkHref } from "@/lib/validation/link";
import Link from "next/link";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("opportunities", {
    title: "Opportunities",
    description: "Hackathons, competitions, internships, and other opportunities shared by FusionX.",
  });

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const supabase = await createClient();
  // "*": the radar's distance (migration 0044) comes along when it exists.
  const { data: all } = await supabase
    .from("opportunities")
    .select("*")
    .eq("is_published", true)
    .order("deadline", { ascending: true });
  // Filters: within a day's travel of Meerut (about 350 km by road), or closing within 7 days.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const week = new Date(new Date(`${today}T00:00:00Z`).getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const opportunities = (all ?? []).filter((o) =>
    show === "near" ? typeof o.distance_km === "number" && o.distance_km <= 350
    : show === "closing" ? !!o.deadline && o.deadline >= today && o.deadline <= week
    : true);

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Opportunities</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Hackathons, internships, and more.
            </h1>
            <p className="mt-4 text-sm text-ink/50 max-w-xl leading-relaxed">
              FusionX shares opportunities it becomes aware of. Listing here isn&rsquo;t a guarantee
              of verification. Always confirm details on the organizer&rsquo;s official page before
              applying.
            </p>
            <nav aria-label="Filter" className="mt-6 flex flex-wrap gap-2 text-sm" data-opp-filters>
              {[["", "All"], ["near", "Near Meerut"], ["closing", "Closing soon"]].map(([k, label]) => (
                <Link key={k} href={k ? `/opportunities?show=${k}` : "/opportunities"} className={(show ?? "") === k ? "border border-ink px-3 py-1 text-ink" : "border border-line px-3 py-1 text-ink/70"}>{label}</Link>
              ))}
            </nav>
          </ScrollReveal>
        </div>
      </section>

      <Section>
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
                    {linkHref(o.registration_url) && (
                      <a
                        href={linkHref(o.registration_url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                      >
                        View details <ArrowRight size={14} className="arrow-nudge" aria-hidden />
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
