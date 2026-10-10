import type { Metadata } from "next";
import { pageMetadata } from "@/lib/data/seo";
import { Section, SectionHeading } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("research", {
    title: "Research & IP",
    description: "Published research entries from FusionX members, and how FusionX approaches IP awareness.",
  });

export default async function ResearchPage() {
  const supabase = await createClient();
  const { data: research } = await supabase
    .from("research")
    .select("id, title, abstract, domain, status, publication_info")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Research &amp; IP</Eyebrow>
                <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink max-w-2xl">
                  Turning projects into documented research.
                </h1>
              </div>
              <div className="flex gap-2.5">
                <LinkButton href="/research/mine" variant="secondary" size="sm">
                  My research
                </LinkButton>
                <LinkButton href="/research/new" size="sm">
                  Add entry
                </LinkButton>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        {research && research.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {research.map((r, i) => (
              <ScrollReveal key={r.id} delay={i * 80}>
                <div className="card-elevated rounded-sm p-7 h-full flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Badge>{r.status}</Badge>
                      {r.domain && <span className="text-xs uppercase tracking-wider text-ink/40">{r.domain}</span>}
                    </div>
                    <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{r.title}</p>
                    <p className="mt-3 text-sm text-ink/55 line-clamp-3 leading-relaxed">{r.abstract}</p>
                  </div>
                  {r.publication_info && (
                    <p className="mt-4 pt-4 border-t border-ink/8 text-xs text-ink/45">{r.publication_info}</p>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState
              title="No research entries published yet."
              description="Research from FusionX members will appear here as work is documented and shared."
            />
          </ScrollReveal>
        )}
      </Section>

      <Section className="pt-0 pb-20">
        <ScrollReveal>
          <SectionHeading eyebrow="IP & Innovation" title="How FusionX approaches intellectual property." />
          <div className="prose-fx max-w-2xl">
            <p>
              FusionX may coordinate with the college&rsquo;s technology and intellectual property
              support mechanisms, including TCPO, where applicable. The IP &amp; Innovation Cell
              helps members understand prior-art review, novelty, and documentation practices.
              It does not itself file or grant patents.
            </p>
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}
