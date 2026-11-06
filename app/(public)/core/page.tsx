import type { Metadata } from "next";
import { Fragment } from "react";
import { Section, SectionHeading } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PersonCard } from "@/components/ui/person-card";
import { CoreMemberCard } from "@/components/ui/core-member-card";
import { siteName } from "@/lib/site-config";
import { getCoreTeams } from "@/lib/data/core-teams";
import { getMentors } from "@/lib/data/mentors";
import { getPeople, peopleIn } from "@/lib/data/people";
import { pageMetadata } from "@/lib/data/seo";
import type { OrgPersonCategory } from "@/types/database";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("founders", {
    title: "Core",
    description: `The founding members, faculty guide, and senior mentor of ${siteName}.`,
  });

// The groups below the founders, in page order. A group with nobody visible
// in it is left out. The mentors (Admin → Mentors) follow the faculty guides.
const GROUPS: { category: OrgPersonCategory; eyebrow: string; title: string }[] = [
  { category: "faculty_guide", eyebrow: "Faculty Guide", title: "Institutional guidance and mentorship." },
  { category: "core_team", eyebrow: "Core Team", title: "The people running FusionX day to day." },
  { category: "advisor", eyebrow: "Advisors", title: "Advice and support from outside the team." },
];

const TEAM_EYEBROW = { core: "Core", hub: "Hub", custom: "Team" } as const;

export default async function CorePage() {
  // Managed from the admin panel (Core). Until that data exists, getPeople
  // returns the people this page has always listed.
  const [people, teams, mentors] = await Promise.all([getPeople(), getCoreTeams(), getMentors()]);
  const founders = peopleIn(people, "founder");
  const onCore = mentors.filter((m) => m.show_on_core);
  const mentorSection = onCore.length > 0 && (
    <Section className="pt-0 md:pt-0" id="mentors">
      <ScrollReveal>
        <SectionHeading eyebrow={onCore.length > 1 ? "Mentors" : "Mentor"} title="Guiding the founding team." />
      </ScrollReveal>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {onCore.map((mentor, i) => (
          <ScrollReveal key={mentor.id} delay={(i + 1) * 100} className="h-full">
            <CoreMemberCard member={mentor} />
          </ScrollReveal>
        ))}
      </div>
    </Section>
  );

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Core</Eyebrow>
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
        const after = group.category === "faculty_guide" ? mentorSection : null;
        if (members.length === 0) return after && <Fragment key={group.category}>{after}</Fragment>;
        return (
          <Fragment key={group.category}>
            <Section className="pt-0 md:pt-0">
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
            {after}
          </Fragment>
        );
      })}

      {teams.map((team) => (
        <Section key={team.id} className="pt-0 md:pt-0">
          <ScrollReveal>
            <SectionHeading eyebrow={TEAM_EYEBROW[team.kind]} title={team.name} description={team.description ?? undefined} />
          </ScrollReveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {team.members.map((member, i) => (
              <ScrollReveal key={member.id} delay={(i + 1) * 100} className="h-full">
                <CoreMemberCard member={member} />
              </ScrollReveal>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
