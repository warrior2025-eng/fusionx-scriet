import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CutCard } from "@/components/ui/cut-card";
import { LinkButton } from "@/components/ui/button";
import { NamedIcon } from "@/components/ui/named-icon";
import { HIGHLIGHT, HubTypeLabel } from "@/components/hubs/hub-cards";
import { getHubs, paragraphs, responsibilityItems } from "@/lib/data/hubs";
import { cycleState, getCurrentCycle } from "@/lib/recruitment/data";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

async function findHub(slug: string) {
  const hubs = await getHubs();
  const index = hubs.findIndex((h) => h.slug === slug);
  return index === -1 ? null : { hub: hubs[index], prev: hubs[index - 1] ?? null, next: hubs[index + 1] ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findHub((await params).slug);
  if (!found) return { title: "FusionX Hubs" };
  const { hub } = found;
  return { title: hub.name, description: hub.tagline ? `${hub.tagline} ${hub.summary}` : hub.summary };
}

function Paragraphs({ text }: { text: string | null }) {
  return (
    <div className="space-y-4 text-ink/80 leading-relaxed md:text-lg">
      {paragraphs(text).map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 font-serif text-2xl md:text-3xl tracking-tight text-ink">{children}</h2>;
}

export default async function HubPage({ params }: Props) {
  const found = await findHub((await params).slug);
  if (!found) notFound();
  const { hub, prev, next } = found;
  const items = responsibilityItems(hub);
  const recruiting = hub.cta === "recruitment" && cycleState(await getCurrentCycle()) === "open";

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-12 pb-12 md:pt-16 md:pb-16">
          <nav aria-label="Breadcrumb" className="mb-10 text-sm text-ink/70">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-accent">Home</Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/hubs" className="hover:text-accent">FusionX Hubs</Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-ink">{hub.name}</li>
            </ol>
          </nav>
          <ScrollReveal>
            <Eyebrow>FusionX Hubs</Eyebrow>
            <div className="flex items-start gap-4">
              {hub.icon_name && (
                <span className="mt-2 hidden text-accent sm:inline-flex">
                  <NamedIcon name={hub.icon_name} size={32} />
                </span>
              )}
              <div>
                <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink max-w-3xl">{hub.name}</h1>
                {hub.tagline && <p className="mt-4 text-lg md:text-xl text-ink/80">{hub.tagline}</p>}
                <HubTypeLabel hub={hub} className="mt-5" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Section className="max-w-4xl space-y-16 md:space-y-20">
        {hub.about && (
          <ScrollReveal>
            <Heading>{hub.cta === "teams" ? `About ${hub.name}` : "About the Team"}</Heading>
            <Paragraphs text={hub.about} />
          </ScrollReveal>
        )}

        {items.length > 0 && (
          <ScrollReveal>
            <Heading>Key Responsibilities</Heading>
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.title + item.description} className="h-full">
                  <CutCard className="p-5 md:p-6">
                    {item.title && <p className="font-semibold text-ink">{item.title}</p>}
                    <p className="mt-1.5 text-sm leading-relaxed text-ink/75">{item.description}</p>
                  </CutCard>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        )}

        {hub.who_should_join && (
          <ScrollReveal>
            <Heading>Who Should Join?</Heading>
            <Paragraphs text={hub.who_should_join} />
          </ScrollReveal>
        )}

        {hub.what_you_gain && (
          <ScrollReveal>
            <Heading>What You Will Gain</Heading>
            <Paragraphs text={hub.what_you_gain} />
          </ScrollReveal>
        )}

        {hub.cta !== "none" && (
          <ScrollReveal>
            <CutCard className={cn("md:p-9", HIGHLIGHT)}>
              {hub.cta === "teams" ? (
                <div className="flex flex-wrap gap-3">
                  <LinkButton href="/teams/register">Register your team</LinkButton>
                  <LinkButton href="/teams" variant="secondary">Find teammates</LinkButton>
                </div>
              ) : recruiting ? (
                <LinkButton href={`/recruitment/apply?hub=${hub.slug}`}>
                  Apply to join this hub <ArrowRight size={16} className="arrow-nudge" />
                </LinkButton>
              ) : (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <p className="font-medium text-ink">Recruitment is currently closed</p>
                  <LinkButton href="/join" variant="secondary">Join FusionX</LinkButton>
                </div>
              )}
            </CutCard>
          </ScrollReveal>
        )}

        {(prev || next) && (
          <nav aria-label="Other hubs" className="grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
            {prev ? (
              <Link href={`/hubs/${prev.slug}`} className="group flex flex-col gap-1 text-sm">
                <span className="inline-flex items-center gap-1.5 text-ink/70"><ArrowLeft size={14} /> Previous hub</span>
                <span className="font-serif text-lg text-ink group-hover:text-accent">{prev.name}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/hubs/${next.slug}`} className="group flex flex-col gap-1 text-sm sm:items-end sm:text-right">
                <span className="inline-flex items-center gap-1.5 text-ink/70">Next hub <ArrowRight size={14} /></span>
                <span className="font-serif text-lg text-ink group-hover:text-accent">{next.name}</span>
              </Link>
            )}
          </nav>
        )}
      </Section>
    </>
  );
}
