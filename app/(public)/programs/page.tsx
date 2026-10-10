import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { NamedIcon } from "@/components/ui/named-icon";
import { getPrograms } from "@/lib/data/programs";
import { pageMetadata } from "@/lib/data/seo";

const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

export async function generateMetadata(): Promise<Metadata> {
  const programs = await getPrograms();
  return pageMetadata("programs", {
    title: "Programs",
    description: `${countWord(programs.length)} structured programs covering every stage of the idea-to-impact pipeline.`,
  });
}

export default async function ProgramsPage() {
  // Managed from the admin panel (Programs); falls back to the original six.
  const programs = await getPrograms();

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Programs</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink max-w-2xl">
              {countWord(programs.length)} {programs.length === 1 ? "track" : "tracks"}, one pipeline from idea to impact.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        <div className="grid md:grid-cols-2 gap-6">
          {programs.map((p, i) => (
            <ScrollReveal key={p.slug} delay={i * 80}>
              <div id={p.slug} className="card-elevated rounded-sm p-7 md:p-8 h-full flex flex-col justify-between group scroll-mt-24">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm tabular-nums text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                    {p.icon_name ? (
                      <span className="text-ink/55 transition-colors group-hover:text-accent">
                        <NamedIcon name={p.icon_name} size={18} />
                      </span>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                    )}
                  </div>
                  <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{p.name}</p>
                  <p className="mt-3 text-sm text-ink/60 leading-relaxed">{p.summary}</p>
                </div>
                {p.details.length > 0 && (
                  <ul className="mt-6 pt-5 border-t border-ink/8 flex flex-wrap gap-2">
                    {p.details.map((d) => (
                      <li key={d} className="text-xs px-2.5 py-1 rounded-full border border-ink/15 text-ink/65 bg-paper/50">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>
    </>
  );
}
