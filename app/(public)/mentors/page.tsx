import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Mentors",
  description: "Faculty, seniors, and alumni mentoring FusionX members.",
};

export default async function MentorsPage() {
  const supabase = await createClient();
  const { data: mentors } = await supabase
    .from("mentors")
    .select("id, name, role_title, expertise, experience, linkedin_url, availability, bio")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Mentors</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              People who can guide you.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        {mentors && mentors.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {mentors.map((m, i) => (
              <ScrollReveal key={m.id} delay={i * 80}>
                <div className="card-elevated rounded-sm p-7 h-full flex flex-col justify-between group">
                  <div>
                    <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{m.name}</p>
                    <p className="text-xs uppercase tracking-wider text-accent font-medium mt-1">{m.role_title}</p>
                    {m.bio && <p className="mt-3 text-sm text-ink/55 leading-relaxed">{m.bio}</p>}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {m.expertise?.map((e: string) => (
                        <span key={e} className="text-xs text-ink/50 bg-ink/5 border border-ink/10 rounded-full px-2.5 py-0.5 font-medium">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 pt-5 border-t border-ink/8 flex items-center justify-between text-xs text-ink/45">
                    {m.availability ? <span>{m.availability}</span> : <span />}
                    {m.linkedin_url && (
                      <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1.5 text-accent font-medium hover:underline">
                        LinkedIn <ArrowRight size={14} className="arrow-nudge" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState title="No mentors listed yet." description="Mentors added by FusionX staff will appear here." />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
