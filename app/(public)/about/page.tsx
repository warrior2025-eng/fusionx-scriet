import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/section";
import { journeyStages } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About",
  description: "Mission, vision, and philosophy behind FusionX @ SCRIET.",
};

export default function AboutPage() {
  return (
    <>
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">About</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">
          Why FusionX exists.
        </h1>
      </Section>

      <Section className="pt-0">
        <div className="prose-fx max-w-2xl">
          <h2>Mission</h2>
          <p>
            To give students at SCRIET a structured path from an early idea to a real outcome —
            a working project, a piece of research, a protected innovation, or a competition
            result — by connecting them with the right people, programs, and resources at each
            stage.
          </p>

          <h2>Vision</h2>
          <p>
            A student-led network where building, researching, and collaborating across
            disciplines is the norm, not the exception — starting at SCRIET and, over time,
            extending into an inter-college network of FusionX chapters.
          </p>

          <h2>Why FusionX exists</h2>
          <p>
            SCRIET already has student clubs focused on events, competitions, and engagement.
            FusionX doesn&rsquo;t aim to replace them. It exists to fill the gap between those
            events and long-term outcomes — the idea-to-impact pipeline: idea, learning, project,
            research, prototype, publication or patent, competition, and onward into incubation
            or continued development. FusionX works as a complementary layer that can connect
            students, projects, research, competitions, and mentorship across whichever clubs and
            departments they&rsquo;re already part of.
          </p>

          <h2>How FusionX works</h2>
          <p>
            Through six focused programs — Build Lab, Research Forum, IP &amp; Innovation Cell,
            Venture Cell, Competition Support &amp; Mentorship, and Teams — FusionX gives students
            a place to move an idea forward at whichever stage they&rsquo;re at, with support from
            peers, seniors, and faculty.
          </p>

          <h2>The Student Journey</h2>
          <ul>
            {journeyStages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ul>

          <h2>Core Philosophy</h2>
          <p>Events are entry points, not the destination.</p>
        </div>
      </Section>
    </>
  );
}
