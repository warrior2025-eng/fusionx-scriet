import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/section";

import { founders, seniorMentor } from "@/lib/site-config";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = {
  title: "Founding Team",
  description: "The founding members, faculty guide, and senior mentor of FusionX@SCRIET.",
};

export default async function FoundersPage() {
  const settings = await getOrganizationSettings();

  return (
    <>
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Founding Team</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">
          Built by students, for students.
        </h1>
      </Section>

      <Section className="pt-0">
        <div className="grid md:grid-cols-3 gap-6">
          {founders.map((f) => (
            <div key={f.name} className="border border-ink/10 rounded-sm p-7 bg-surface">
              <div className="h-12 w-12 rounded-full bg-ink/5 border border-ink/10 flex items-center justify-center text-ink/50 font-medium mb-5">
                {f.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <p className="font-medium text-ink">{f.name}</p>
              <p className="text-sm text-accent mt-1 mb-3">{f.role}</p>
              <p className="text-sm text-ink/55 leading-relaxed">{f.responsibilities}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeading eyebrow="Faculty Guide" title="Institutional guidance and mentorship." />
        <div className="border border-ink/10 rounded-sm p-7 bg-surface">
          <p className="font-medium text-ink">{settings.faculty_guide_name}</p>
          <p className="text-sm text-ink/55 mt-1">{settings.faculty_guide_title}</p>
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeading eyebrow="Senior Mentor" title="Guiding the founding team." />
        <div className="border border-ink/10 rounded-sm p-7 bg-surface max-w-md">
          <p className="font-medium text-ink">{seniorMentor.name}</p>
          <p className="text-sm text-ink/55 mt-1">{seniorMentor.role}</p>
        </div>
      </Section>
    </>
  );
}
