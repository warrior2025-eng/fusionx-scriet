import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CutCard } from "@/components/ui/cut-card";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { DateBlock } from "@/components/ui/date-block";
import { NamedIcon } from "@/components/ui/named-icon";
import { PersonCard } from "@/components/ui/person-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { FusionXHero } from "@/components/hero/fusionx-hero";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getPeople, peopleIn } from "@/lib/data/people";
import { getPrograms } from "@/lib/data/programs";
import { pageMetadata } from "@/lib/data/seo";
import { getContent } from "@/lib/data/site-content";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = (): Promise<Metadata> => pageMetadata("home", {});

// A floating hero layer: how far it rides the pointer (px) and how much it turns (deg).
const float = (pd: number, pr: number) => ({ "--pd": pd, "--pr": pr }) as React.CSSProperties;

const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** The headline, line by line, with the first occurrence of `highlight` in the accent colour. */
function Headline({ text, highlight }: { text: string; highlight: string }) {
  let used = false;
  return text.split("\n").map((line, i) => {
    const at = !used && highlight ? line.indexOf(highlight) : -1;
    if (at >= 0) used = true;
    return (
      <Fragment key={i}>
        {i > 0 && <br />}
        {at < 0 ? (
          line
        ) : (
          <>
            {line.slice(0, at)}
            <span className="accent-large text-accent">{highlight}</span>
            {line.slice(at + highlight.length)}
          </>
        )}
      </Fragment>
    );
  });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Up to three published projects, featured ones first. */
async function homeProjects(supabase: Supabase) {
  const published = () =>
    supabase.from("projects").select("id, title, description, domain, status, technologies").eq("is_published", true);
  const featuredFirst = await published()
    .order("is_featured", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(3);
  if (!featuredFirst.error) return featuredFirst.data;
  // Before migration 0008 there is no is_featured column: newest first.
  return (await published().order("updated_at", { ascending: false }).limit(3)).data;
}

export default async function HomePage() {
  const supabase = await createClient();

  const [
    settings,
    hero,
    show,
    pipeline,
    journey,
    coreAreas,
    people,
    programs,
    projects,
    { data: events },
    { data: memberCount, error: memberCountError },
    { count: projectCount },
    { count: eventCount },
  ] = await Promise.all([
    getOrganizationSettings(),
    getContent("home.hero"),
    getContent("home.sections"),
    getContent("lists.pipeline"),
    getContent("lists.journey"),
    getContent("lists.core_areas"),
    getPeople(),
    getPrograms(),
    homeProjects(supabase),
    supabase
      .from("events")
      .select("id, title, event_date, venue, status")
      .eq("is_published", true)
      .in("status", ["upcoming", "live"])
      .order("event_date", { ascending: true })
      .limit(3),
    // Count-only function (migration 0006): the same number for every visitor,
    // whatever the profiles RLS policy lets them read.
    supabase.rpc("get_member_count"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("is_published", true),
  ]);

  if (memberCountError) console.error("get_member_count failed:", memberCountError.message);

  // Real counts only, never fabricated: a failed or empty count shows as 0.
  // All three are always shown, to every visitor.
  const stats = [
    { label: "Students", value: typeof memberCount === "number" ? memberCount : 0 },
    { label: "Projects", value: projectCount ?? 0 },
    { label: "Events", value: eventCount ?? 0 },
  ];

  const founders = peopleIn(people, "founder");
  const facultyGuides = peopleIn(people, "faculty_guide");

  // The sections after the hero, in order. Each can be switched off from the
  // admin panel (Page content); the numbering and the alternating bands
  // follow whatever is left.
  type Band = "surface" | "tint" | undefined;
  const sections: { key: string; visible: boolean; render: (index: number, band: Band) => React.ReactNode }[] = [
    {
      key: "about",
      visible: true,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading index={index} eyebrow="About" title="An ecosystem, not just a club." />
            <CutCard className="p-8 md:p-10">
              <p className="max-w-3xl text-base leading-relaxed text-ink/80 md:text-lg">
                {settings.chapter_name} exists to help students move beyond attending events and into
                actually building projects, conducting research, protecting their ideas, and carrying
                work forward past a single competition.
              </p>
              <Link href="/about" className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent">
                <span className="link-slide">Why FusionX exists</span>
                <ArrowRight size={14} className="arrow-nudge" />
              </Link>
            </CutCard>
          </ScrollReveal>
        </Section>
      ),
    },
    {
      key: "pipeline",
      visible: show.pipeline,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading index={index} eyebrow="Idea to impact" title="The full pipeline, not a single weekend." />
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <CutCard className="p-8 md:p-10">
              <Stepper steps={pipeline} label="Idea to impact pipeline" />
              <div className="mt-10 border-t border-line pt-6">
                <p className="text-sm font-medium text-ink/70">The member journey</p>
                <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/80">
                  {journey.map((stage, i) => (
                    <li key={`${stage}-${i}`} className="flex items-baseline gap-2">
                      <span className="tabular-nums text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                      {stage}
                    </li>
                  ))}
                </ol>
              </div>
            </CutCard>
          </ScrollReveal>
        </Section>
      ),
    },
    {
      key: "coreAreas",
      visible: show.coreAreas,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading
              index={index}
              eyebrow="Core areas"
              title={`${countWord(coreAreas.length)} ways to get involved.`}
            />
          </ScrollReveal>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {coreAreas.map((area, i) => (
              <li key={`${area.label}-${i}`}>
                <ScrollReveal delay={i * 60} className="h-full">
                  <div className="group flex h-full items-center gap-3 border border-line bg-surface/90 px-4 py-4 transition-colors duration-150 hover:border-accent">
                    <span className="text-ink/70 transition-colors duration-150 group-hover:text-accent">
                      <NamedIcon name={area.icon} />
                    </span>
                    <span className="font-medium text-ink">{area.label}</span>
                  </div>
                </ScrollReveal>
              </li>
            ))}
          </ul>
        </Section>
      ),
    },
    {
      key: "programs",
      visible: show.programs,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading
              index={index}
              eyebrow="Programs"
              title="Structured tracks for every stage of the journey."
              description={`${countWord(programs.length)} focused programs, each built around a different part of the idea-to-impact pipeline.`}
              action={
                <LinkButton href="/programs" variant="secondary" size="sm">
                  View all programs <ArrowRight size={14} className="arrow-nudge" />
                </LinkButton>
              }
            />
          </ScrollReveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p, i) => (
              <ScrollReveal key={p.slug} delay={i * 60} className="h-full">
                <CutCard interactive className="flex flex-col">
                  {p.icon_name && (
                    <span className="mb-4 text-ink/70">
                      <NamedIcon name={p.icon_name} size={20} />
                    </span>
                  )}
                  <h3 className="font-serif text-xl font-medium text-ink">{p.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/75">{p.summary}</p>
                  <Link
                    href={`/programs#${p.slug}`}
                    className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-accent"
                  >
                    <span className="link-slide">Learn more</span>
                    <ArrowRight size={14} className="arrow-nudge" />
                  </Link>
                </CutCard>
              </ScrollReveal>
            ))}
          </div>
        </Section>
      ),
    },
    {
      key: "projects",
      visible: show.projects,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading
              index={index}
              eyebrow="Projects"
              title="What students are building right now."
              action={
                <LinkButton href="/projects" variant="secondary" size="sm">
                  Browse all projects <ArrowRight size={14} className="arrow-nudge" />
                </LinkButton>
              }
            />
          </ScrollReveal>
          {projects && projects.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => (
                <ScrollReveal key={p.id} delay={i * 60} className="h-full">
                  <CutCard className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-4">
                      <Badge className="rounded-none capitalize">{p.status}</Badge>
                      {p.domain && <span className="text-sm text-ink/65">{p.domain}</span>}
                    </div>
                    <h3 className="mt-4 font-serif text-lg font-medium text-ink">{p.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/75">{p.description}</p>
                    {p.technologies?.length > 0 && (
                      <ul className="mt-auto flex flex-wrap gap-1.5 pt-5">
                        {p.technologies.slice(0, 4).map((t: string) => (
                          <li key={t} className="border border-line px-2 py-0.5 text-xs text-ink/75">
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CutCard>
                </ScrollReveal>
              ))}
            </div>
          ) : (
            <ScrollReveal>
              <EmptyState
                title="No projects published yet."
                description="FusionX projects will appear here as ideas move into development."
                action={
                  <LinkButton href="/projects/new" size="sm">
                    Start a project <ArrowRight size={14} className="arrow-nudge" />
                  </LinkButton>
                }
              />
            </ScrollReveal>
          )}
        </Section>
      ),
    },
    {
      key: "events",
      visible: show.events,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading
              index={index}
              eyebrow="Events"
              title="Upcoming on the calendar."
              action={
                <LinkButton href="/events" variant="secondary" size="sm">
                  All events <ArrowRight size={14} className="arrow-nudge" />
                </LinkButton>
              }
            />
          </ScrollReveal>
          {events && events.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e, i) => (
                <ScrollReveal key={e.id} delay={i * 60} className="h-full">
                  <CutCard className="flex gap-4">
                    <DateBlock date={e.event_date} />
                    <div className="min-w-0 pr-2">
                      <Badge className="rounded-none capitalize">{e.status}</Badge>
                      <h3 className="mt-3 font-serif text-lg font-medium text-ink">{e.title}</h3>
                      {e.venue && <p className="mt-1 text-sm text-ink/70">{e.venue}</p>}
                    </div>
                  </CutCard>
                </ScrollReveal>
              ))}
            </div>
          ) : (
            <ScrollReveal>
              <EmptyState
                title="No upcoming events scheduled yet."
                description="FusionX events will be listed here as they're announced."
                action={
                  <LinkButton href="/events" variant="secondary" size="sm">
                    See the events page <ArrowRight size={14} className="arrow-nudge" />
                  </LinkButton>
                }
              />
            </ScrollReveal>
          )}
        </Section>
      ),
    },
    {
      key: "team",
      visible: show.team && founders.length > 0,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading
              index={index}
              eyebrow="Founding team"
              title="Built by students, for students."
              action={
                <LinkButton href="/founders" variant="secondary" size="sm">
                  Meet the full team <ArrowRight size={14} className="arrow-nudge" />
                </LinkButton>
              }
            />
          </ScrollReveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {founders.map((person, i) => (
              <ScrollReveal key={person.id} delay={i * 60} className="h-full">
                <PersonCard person={person} compact />
              </ScrollReveal>
            ))}
          </div>
        </Section>
      ),
    },
    {
      key: "faculty",
      visible: facultyGuides.length > 0,
      render: (index, band) => (
        <Section band={band}>
          <ScrollReveal>
            <SectionHeading index={index} eyebrow="Faculty guides" title="Faculty advisory." />
          </ScrollReveal>
          <div className="grid gap-5 sm:grid-cols-2">
            {facultyGuides.map((person, i) => (
              <ScrollReveal key={person.id} delay={i * 60} className="h-full">
                <CutCard>
                  <h3 className="font-serif text-xl font-medium text-ink">{person.full_name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/70">{person.role_title}</p>
                </CutCard>
              </ScrollReveal>
            ))}
          </div>
        </Section>
      ),
    },
  ];

  const BANDS: Band[] = [undefined, "surface", "tint"];
  const visibleSections = sections.filter((section) => section.visible);

  return (
    <>
      <ScrollProgress />

      {/* The one 3D scene, fixed behind the whole page. The hero shows it
          directly; everything after sits in .home-below (see globals.css). */}
      <div className="home-scene">
        <FusionXHero floatTarget="#home-hero" />
      </div>

      {/* ================================================================
          HERO: copy as real HTML over the scene. Each block is a layer
          that floats on the pointer (`hero-float`; --pd = travel in px,
          --pr = turn in degrees, the ThreeUI page's own values). The scene
          follows the theme (night on navy / daylight on pale blue), and so
          does the copy, through the ordinary tokens. The words come from
          the admin panel (Page content), with the originals as fallback.
          ================================================================ */}
      <section
        id="home-hero"
        data-scene-window
        className="relative flex min-h-[calc(100svh-4rem)] items-center"
      >
        {/* Scrim so the copy stays readable where it overlaps the scene */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/80 via-paper/55 to-transparent lg:bg-gradient-to-r lg:from-paper/85 lg:via-paper/45 lg:to-transparent"
          aria-hidden
        />

        <div className="container-fx relative w-full py-16 md:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <div className="hero-float" style={float(18, 1.2)}>
                <Eyebrow className="animate-fade">{hero.eyebrow}</Eyebrow>
                <h1 className="font-serif text-[clamp(2.75rem,7vw,5.75rem)] leading-[1.02] tracking-tight text-ink animate-reveal">
                  <Headline text={hero.headline} highlight={hero.highlight} />
                </h1>
              </div>

              <div className="hero-float mt-7" style={float(14, 1)}>
                <p className="max-w-xl text-base leading-relaxed text-ink/85 md:text-lg animate-reveal stagger-2">
                  {hero.description.replaceAll("{name}", settings.chapter_name)}
                </p>
              </div>

              <div className="hero-float mt-9" style={float(15, 1.4)}>
                <div className="flex flex-col gap-3 sm:flex-row animate-reveal stagger-3">
                  <LinkButton href={hero.primaryCta.href} size="lg">
                    {hero.primaryCta.label} <ArrowRight size={16} className="arrow-nudge" />
                  </LinkButton>
                  <LinkButton href={hero.secondaryCta.href} variant="secondary" size="lg" className="bg-paper/60">
                    {hero.secondaryCta.label}
                  </LinkButton>
                </div>
              </div>

              {/* Activity: shown to everyone, zeros included */}
              {show.activity && (
                <div className="hero-float mt-10 sm:max-w-md" style={float(12, 0)}>
                  <CutCard className="p-5 md:p-6 animate-reveal stagger-4">
                    <Eyebrow>Activity</Eyebrow>
                    <dl className="grid grid-cols-3 divide-x divide-line">
                      {stats.map((s) => (
                        <div key={s.label} className="flex flex-col-reverse px-4 first:pl-0 last:pr-0 sm:px-5">
                          <dt className="mt-1 text-sm text-ink/70">{s.label}</dt>
                          <dd>
                            <AnimatedCounter
                              value={s.value}
                              className="block font-serif text-3xl font-medium tabular-nums text-ink md:text-4xl"
                            />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CutCard>
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              <div className="hero-float" style={float(22, 2.4)}>
                <CutCard className="animate-reveal stagger-3">
                  <p className="font-serif text-2xl leading-snug text-ink md:text-[1.75rem]">
                    Learn. Build. Research. Impact.
                  </p>
                  <p className="mt-4 leading-relaxed text-ink/80">
                    A network where campus conversations turn into working projects, documented
                    research, and outcomes that outlast a single event.
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
                    {coreAreas.map((area, i) => (
                      <li
                        key={`${area.label}-${i}`}
                        className="flex items-center gap-2 border border-line px-3 py-1.5 text-sm text-ink/85"
                      >
                        <NamedIcon name={area.icon} />
                        {area.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-sm text-ink/65">Student Innovation &amp; Research, SCRIET, CCSU</p>
                </CutCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="home-below" data-scene-window="dark">
        {visibleSections.map((section, i) => (
          <Fragment key={section.key}>{section.render(i + 1, BANDS[i % BANDS.length])}</Fragment>
        ))}

        {/* Join: the deep-navy brand band, in both themes */}
        {show.join && (
          <Section band="navy">
            <ScrollReveal>
              <div>
                <Eyebrow>Join the network</Eyebrow>
                <div className="flex flex-wrap items-end justify-between gap-8">
                  <div className="max-w-xl">
                    <h2 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">
                      Don&rsquo;t just participate. Build.
                    </h2>
                    <p className="mt-4 leading-relaxed text-ink/75">
                      Join FusionX and become part of a network of students building, researching, and
                      competing together.
                    </p>
                  </div>
                  <LinkButton href="/join" size="lg">
                    Join FusionX <ArrowRight size={16} className="arrow-nudge" />
                  </LinkButton>
                </div>
              </div>
            </ScrollReveal>
          </Section>
        )}
      </div>
    </>
  );
}
