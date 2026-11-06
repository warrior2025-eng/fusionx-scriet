import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { CoreMemberCard } from "@/components/ui/core-member-card";
import { getMentors } from "@/lib/data/mentors";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Mentors",
  description: "Faculty, seniors, and alumni mentoring FusionX members.",
};

export default async function MentorsPage() {
  // Admin → Mentors; the same list, in the same order, as on the Core page.
  const mentors = await getMentors();

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
        {mentors.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-mentors>
            {mentors.map((m, i) => (
              <ScrollReveal key={m.id} delay={i * 80} className="h-full">
                <CoreMemberCard member={m} tags={m.expertise} note={m.availability} />
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
