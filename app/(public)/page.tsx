import Link from "next/link";
import { ArrowRight, Hammer, FlaskConical, Users, Trophy, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CutCard } from "@/components/ui/cut-card";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { DateBlock } from "@/components/ui/date-block";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { FusionXHero } from "@/components/hero/fusionx-hero";
import {
  founders,
  programs,
  journeyStages,
  buildPipeline,
  coreAreas,
  additionalFacultyGuides,
  siteName,
} from "@/lib/site-config";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createClient } from "@/lib/supabase/server";

const areaIcons: Record<string, React.ReactNode> = {
  Build: <Hammer size={18} />,
  Research: <FlaskConical size={18} />,
  Connect: <Users size={18} />,
  Compete: <Trophy size={18} />,
  Create: <Sparkles size={18} />,
};

// A floating hero layer: how far it rides the pointer (px) and how much it turns (deg).
const float = (pd: number, pr: number) => ({ "--pd": pd, "--pr": pr }) as React.CSSProperties;

export default async function HomePage() {
  const settings = await getOrganizationSettings();
  const supabase = await createClient();

  const [
    { data: projects },
    { data: events },
    { data: memberCount, error: memberCountError },
    { count: projectCount },
    { count: eventCount },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, domain, status, technologies")
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(3),
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

  return (
    <>
      <ScrollProgress />

      {/* The one 3D scene, fixed behind the whole page. The hero shows it
          directly; everything after sits in .home-below (see globals.css). */}
      <div className="home-scene">
        <FusionXHero floatTarget="#home-hero" />
      </div>

      {/* ================================================================
          HERO — copy as real HTML over the scene. Each block is a layer
          that floats on the pointer (`hero-float`; --pd = travel in px,
          --pr = turn in degrees — the ThreeUI page's own values). The scene
          follows the theme (night on navy / daylight on pale blue), and so
          does the copy, through the ordinary tokens.
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
                <Eyebrow className="animate-fade">A Student-Led Movement</Eyebrow>
                <h1 className="font-serif text-[clamp(2.75rem,7vw,5.75rem)] leading-[1.02] tracking-tight text-ink animate-reveal">
                  Ideas <span className="accent-large text-accent">Grow</span>
                  <br />
                  Here.
                </h1>
              </div>

              <div className="hero-float mt-7" style={float(14, 1)}>
                <p className="max-w-xl text-base leading-relaxed text-ink/85 md:text-lg animate-reveal stagger-2">
                  {settings.chapter_name} brings together students, ideas, and opportunities to
                  build, research, and create real-world impact, together.
                </p>
              </div>

              <div className="hero-float mt-9" style={float(15, 1.4)}>
                <div className="flex flex-col gap-3 sm:flex-row animate-reveal stagger-3">
                  <LinkButton href="/programs" size="lg">
                    Explore Programs <ArrowRight size={16} className="arrow-nudge" />
                  </LinkButton>
                  <LinkButton href="/join" variant="secondary" size="lg" className="bg-paper/60">
                    Join the Network
                  </LinkButton>
                </div>
              </div>

              {/* Activity: shown to everyone, zeros included */}
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
                    {coreAreas.map((area) => (
                      <li
                        key={area}
                        className="flex items-center gap-2 border border-line px-3 py-1.5 text-sm text-ink/85"
                      >
                        {areaIcons[area]}
                        {area}
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
        {/* 01 — About */}
        <Section>
          <ScrollReveal>
            <SectionHeading index={1} eyebrow="About" title="An ecosystem, not just a club." />
            <CutCard className="p-8 md:p-10">
              <p className="max-w-3xl text-base leading-relaxed text-ink/80 md:text-lg">
                {siteName} exists to help students move beyond attending events and into
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

        {/* 02 — Pipeline */}
        <Section band="surface">
          <ScrollReveal>
            <SectionHeading index={2} eyebrow="Idea to impact" title="The full pipeline, not a single weekend." />
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <CutCard className="p-8 md:p-10">
              <Stepper steps={buildPipeline} label="Idea to impact pipeline" />
              <div className="mt-10 border-t border-line pt-6">
                <p className="text-sm font-medium text-ink/70">The member journey</p>
                <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/80">
                  {journeyStages.map((stage, i) => (
                    <li key={stage} className="flex items-baseline gap-2">
                      <span className="tabular-nums text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                      {stage}
                    </li>
                  ))}
                </ol>
              </div>
            </CutCard>
          </ScrollReveal>
        </Section>

        {/* 03 — Core areas */}
        <Section band="tint">
          <ScrollReveal>
            <SectionHeading index={3} eyebrow="Core areas" title="Five ways to get involved." />
          </ScrollReveal>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {coreAreas.map((area, i) => (
              <li key={area}>
                <ScrollReveal delay={i * 60} className="h-full">
                  <div className="group flex h-full items-center gap-3 border border-line bg-surface/90 px-4 py-4 transition-colors duration-150 hover:border-accent">
                    <span className="text-ink/70 transition-colors duration-150 group-hover:text-accent">
                      {areaIcons[area]}
                    </span>
                    <span className="font-medium text-ink">{area}</span>
                  </div>
                </ScrollReveal>
              </li>
            ))}
          </ul>
        </Section>

        {/* 04 — Programs */}
        <Section>
          <ScrollReveal>
            <SectionHeading
              index={4}
              eyebrow="Programs"
              title="Structured tracks for every stage of the journey."
              description="Six focused programs, each built around a different part of the idea-to-impact pipeline."
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

        {/* 05 — Projects */}
        <Section band="surface">
          <ScrollReveal>
            <SectionHeading
              index={5}
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

        {/* 06 — Events */}
        <Section band="tint">
          <ScrollReveal>
            <SectionHeading
              index={6}
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

        {/* 07 — Founding team */}
        <Section>
          <ScrollReveal>
            <SectionHeading
              index={7}
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
            {founders.map((f, i) => (
              <ScrollReveal key={f.name} delay={i * 60} className="h-full">
                <CutCard className="flex items-start gap-4">
                  <InitialsAvatar name={f.name} />
                  <div className="min-w-0 pr-2">
                    <h3 className="font-serif text-lg font-medium text-ink">{f.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink/70">{f.role}</p>
                  </div>
                </CutCard>
              </ScrollReveal>
            ))}
          </div>
        </Section>

        {/* 08 — Faculty guides */}
        <Section band="surface">
          <ScrollReveal>
            <SectionHeading index={8} eyebrow="Faculty guides" title="Faculty advisory." />
          </ScrollReveal>
          <div className="grid gap-5 sm:grid-cols-2">
            <ScrollReveal className="h-full">
              <CutCard>
                <h3 className="font-serif text-xl font-medium text-ink">{settings.faculty_guide_name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/70">{settings.faculty_guide_title}</p>
              </CutCard>
            </ScrollReveal>
            {additionalFacultyGuides.map((f, i) => (
              <ScrollReveal key={f.name} delay={(i + 1) * 60} className="h-full">
                <CutCard>
                  <h3 className="font-serif text-xl font-medium text-ink">{f.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/70">{f.title}</p>
                </CutCard>
              </ScrollReveal>
            ))}
          </div>
        </Section>

        {/* Join — the deep-navy brand band, in both themes */}
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
      </div>
    </>
  );
}
