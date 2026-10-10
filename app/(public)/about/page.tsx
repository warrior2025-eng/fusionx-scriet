import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { siteName } from "@/lib/site-config";
import { pageMetadata } from "@/lib/data/seo";
import { getContent } from "@/lib/data/site-content";
import { Eyebrow } from "@/components/ui/eyebrow";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("about", { title: "About", description: `Mission, vision, and philosophy behind ${siteName}.` });

export default async function AboutPage() {
  // Mission, vision and "why" are edited in the admin panel (Page content),
  // with the original text as the fallback. The journey is the same list the
  // home page shows.
  const [about, journeyStages] = await Promise.all([getContent("about.page"), getContent("lists.journey")]);

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>About</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Why FusionX exists.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        <div className="prose-fx max-w-2xl">
          <ScrollReveal delay={50}>
            <h2>Mission</h2>
            <p className="whitespace-pre-line">{about.mission}</p>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <h2>Vision</h2>
            <p className="whitespace-pre-line">{about.vision}</p>
          </ScrollReveal>

          <ScrollReveal delay={150}>
            <h2>Why FusionX exists</h2>
            <p className="whitespace-pre-line">{about.why}</p>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <h2>How FusionX works</h2>
            <p>
              Through six focused programs (Build Lab, Research Forum, IP &amp; Innovation Cell,
              Venture Cell, Competition Support &amp; Mentorship, and Teams), FusionX gives students
              a place to move an idea forward at whichever stage they&rsquo;re at, with support from
              peers, seniors, and faculty.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={250}>
            <h2>The Student Journey</h2>
            <ul className="space-y-1">
              {journeyStages.map((stage, i) => (
                <li key={`${stage}-${i}`}>{stage}</li>
              ))}
            </ul>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <h2>Core Philosophy</h2>
            <p>Events are entry points, not the destination.</p>
          </ScrollReveal>
        </div>
      </Section>
    </>
  );
}
