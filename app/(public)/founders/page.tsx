import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { founders, seniorMentor, additionalFacultyGuides, siteName } from "@/lib/site-config";
import { getOrganizationSettings } from "@/lib/data/organization";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Founding Team",
  description: `The founding members, faculty guide, and senior mentor of ${siteName}.`,
};

export default async function FoundersPage() {
  const settings = await getOrganizationSettings();

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

      <Section>
        <div className="grid md:grid-cols-3 gap-6">
          {founders.map((f, i) => (
            <ScrollReveal key={f.name} delay={i * 100}>
              <div className="card-elevated rounded-sm p-7 h-full flex flex-col justify-between group">
                <div>
                  <div className="h-12 w-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-semibold text-sm mb-5 group-hover:scale-105 transition-transform">
                    {f.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <p className="font-serif text-xl font-medium text-ink">{f.name}</p>
                  <p className="text-xs font-medium uppercase tracking-wider text-accent mt-1 mb-4">{f.role}</p>
                  <p className="text-sm text-ink/55 leading-relaxed">{f.responsibilities}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0 md:pt-0">
        <ScrollReveal>
          <SectionHeading eyebrow="Faculty Guide" title="Institutional guidance and mentorship." />
        </ScrollReveal>
        <div className="space-y-4">
          <ScrollReveal delay={100}>
            <div className="card-elevated rounded-sm p-7">
              <p className="font-serif text-xl font-medium text-ink">{settings.faculty_guide_name}</p>
              <p className="text-sm text-ink/55 mt-1">{settings.faculty_guide_title}</p>
            </div>
          </ScrollReveal>
          {additionalFacultyGuides.map((f, i) => (
            <ScrollReveal key={f.name} delay={(i + 2) * 100}>
              <div className="card-elevated rounded-sm p-7">
                <p className="font-serif text-xl font-medium text-ink">{f.name}</p>
                <p className="text-sm text-ink/55 mt-1">{f.title}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      <Section className="pt-8 pb-20">
        <ScrollReveal>
          <SectionHeading eyebrow="Senior Mentor" title="Guiding the founding team." />
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="card-elevated rounded-sm p-7 max-w-md">
            <p className="font-serif text-xl font-medium text-ink">{seniorMentor.name}</p>
            <p className="text-sm text-ink/55 mt-1">{seniorMentor.role}</p>
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}