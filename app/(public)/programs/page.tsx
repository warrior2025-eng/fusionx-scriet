import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { programs } from "@/lib/site-config";

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
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Programs</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink max-w-2xl">
          Six tracks, one pipeline from idea to impact.
        </h1>
      </Section>

      <Section className="pt-0">
        <div className="grid md:grid-cols-2 gap-6">
          {programs.map((p) => (
            <div key={p.slug} id={p.slug} className="border border-ink/10 rounded-sm p-7 bg-surface">
              <p className="font-medium text-lg text-ink">{p.name}</p>
              <p className="mt-2 text-sm text-ink/60 leading-relaxed">{p.summary}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {details[p.slug]?.map((d) => (
                  <li key={d} className="text-xs px-2.5 py-1 rounded-full border border-ink/15 text-ink/60">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
