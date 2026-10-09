import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { programs } from "@/lib/site-config";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Programs",
  description: "Six structured programs covering every stage of the idea-to-impact pipeline.",
};

const details: Record<string, string[]> = {
  "build-lab": ["Ideation", "Team formation", "Technical workshops", "Build sessions", "Prototype reviews", "Demonstrations"],
  "research-forum": ["Research orientation", "Literature review", "Methodology", "Experimentation", "Documentation", "Research collaboration"],
  "ip-innovation-cell": ["Patent awareness", "Prior-art awareness", "Novelty", "Documentation", "IP education", "TCPO coordination where applicable"],
  "venture-cell": ["Problem discovery", "Customer discovery", "MVP", "Market research", "Business models", "Pitching", "Incubation/funding awareness"],
  "competition-support": ["Hackathons", "Innovation competitions", "Preparation", "Mentorship", "Submission support", "Post-competition continuation"],
  "fusionx-teams": ["Interdisciplinary collaboration", "Skill-based team formation", "Project teams", "Team coordination"],
};

export default function ProgramsPage() {
  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Programs</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink max-w-2xl">
              Six tracks, one pipeline from idea to impact.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        <div className="grid md:grid-cols-2 gap-6">
          {programs.map((p, i) => (
            <ScrollReveal key={p.slug} delay={i * 80}>
              <div id={p.slug} className="card-elevated rounded-sm p-7 md:p-8 h-full flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm tabular-nums text-ink/45">0{i + 1}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                  </div>
                  <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{p.name}</p>
                  <p className="mt-3 text-sm text-ink/60 leading-relaxed">{p.summary}</p>
                </div>
                <ul className="mt-6 pt-5 border-t border-ink/8 flex flex-wrap gap-2">
                  {details[p.slug]?.map((d) => (
                    <li key={d} className="text-xs px-2.5 py-1 rounded-full border border-ink/15 text-ink/65 bg-paper/50">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>
    </>
  );
}
