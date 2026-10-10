import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PersonCard } from "@/components/ui/person-card";
import { siteName } from "@/lib/site-config";
import { getPeople, peopleIn } from "@/lib/data/people";
import { pageMetadata } from "@/lib/data/seo";
import type { OrgPersonCategory } from "@/types/database";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("founders", {
    title: "Founding Team",
    description: `The founding members, faculty guide, and senior mentor of ${siteName}.`,
  });

// The groups below the founders, in page order. A group with nobody visible
// in it is left out.
const GROUPS: { category: OrgPersonCategory; eyebrow: string; title: string }[] = [
  { category: "faculty_guide", eyebrow: "Faculty Guide", title: "Institutional guidance and mentorship." },
  { category: "senior_mentor", eyebrow: "Senior Mentor", title: "Guiding the founding team." },
  { category: "core_team", eyebrow: "Core Team", title: "The people running FusionX day to day." },
  { category: "advisor", eyebrow: "Advisors", title: "Advice and support from outside the team." },
];

export default async function FoundersPage() {
  // Managed from the admin panel (Team). Until that data exists, getPeople
  // returns the people this page has always listed.
  const people = await getPeople();
  const founders = peopleIn(people, "founder");

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Founding Team</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Built by students, for students.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      {founders.length > 0 && (
        <Section>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {founders.map((person, i) => (
              <ScrollReveal key={person.id} delay={i * 100} className="h-full">
                <PersonCard person={person} />
              </ScrollReveal>
            ))}
          </div>
        </Section>
      )}

      {GROUPS.map((group) => {
        const members = peopleIn(people, group.category);
        if (members.length === 0) return null;
        return (
          <Section key={group.category} className="pt-0 md:pt-0">
            <ScrollReveal>
              <SectionHeading eyebrow={group.eyebrow} title={group.title} />
            </ScrollReveal>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {members.map((person, i) => (
                <ScrollReveal key={person.id} delay={(i + 1) * 100} className="h-full">
                  <PersonCard person={person} />
                </ScrollReveal>
              ))}
            </div>
          </Section>
        );
      })}
    </>
  );
}
