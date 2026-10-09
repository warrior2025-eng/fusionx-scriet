import { ArrowRight, Hammer, FlaskConical, Users, Trophy, Sparkles, Terminal } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { FusionXHero } from "@/components/hero/fusionx-hero";
import { TechBackdrop } from "@/components/ui/tech-backdrop";
import { founders, programs, journeyStages, buildPipeline, coreAreas, additionalFacultyGuides } from "@/lib/site-config";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createClient } from "@/lib/supabase/server";

const areaIcons: Record<string, React.ReactNode> = {
  Build: <Hammer size={20} />,
  Research: <FlaskConical size={20} />,
  Connect: <Users size={20} />,
  Compete: <Trophy size={20} />,
  Create: <Sparkles size={20} />,
};

// The hero scene is dark in both themes, so the hero pins the dark tokens.
const heroTokens = {
  "--color-paper": "#050a12",
  "--color-ink": "#e8ecf4",
  "--color-surface": "#0c1222",
} as React.CSSProperties;

// A floating hero layer: how far it rides the pointer (px) and how much it turns (deg).
const float = (pd: number, pr: number) => ({ "--pd": pd, "--pr": pr }) as React.CSSProperties;

export default async function HomePage() {
  const settings = await getOrganizationSettings();
  const supabase = await createClient();

  const [
    { data: projects },
    { data: events },
    { count: memberCount },
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
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("is_published", true),
  ]);

  // Real counts only — never fabricated. Shows 0 until there's actually
  // something to count; see lib/site-config.ts for the no-fabrication rule.
  const stats = [
    { label: "Students", value: memberCount ?? 0, code: "MEMBERS" },
    { label: "Projects", value: projectCount ?? 0, code: "REPOSITORIES" },
    { label: "Events", value: eventCount ?? 0, code: "SESSIONS" },
  ];

  return (
    <>
      {/* Animated background for the whole page (CSS only) */}
      <TechBackdrop />

      {/* ================================================================
          HERO — 3D scene backdrop (ThreeUI "Living Green", recoloured to the
          FusionX logo) with the copy as real HTML above it, laid out the way
          the authored page lays its own: headline, lede and panels as separate
          layers that float on the pointer at different depths (`hero-float`;
          --pd = travel in px, --pr = turn in degrees — the authored values).
          The scene stays dark in both themes, so this section pins its own
          dark tokens and uses fixed colours.
          ================================================================ */}
      <section
        className="relative isolate min-h-[92vh] overflow-hidden border-b border-white/10 bg-[#00030D] text-[#E8ECF4]"
        style={heroTokens}
      >
        <FusionXHero />
        {/* Scrim so the copy stays readable where it overlaps the scene */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#00030D]/75 via-[#00030D]/35 to-transparent"
          aria-hidden
        />
        {/* HUD frame over the scene: grid, corner brackets, sweep, readout */}
        <div className="hero-hud" aria-hidden>
          <div className="hero-hud__grid" />
          <div className="hero-hud__sweep" />
          <span className="hero-hud__corner hero-hud__corner--tl" />
          <span className="hero-hud__corner hero-hud__corner--tr" />
          <span className="hero-hud__corner hero-hud__corner--bl" />
          <span className="hero-hud__corner hero-hud__corner--br" />
          <div className="hero-hud__readout">
            <span>
              <span className="hero-hud__blink">&#9679;</span> Scene live
            </span>
            <span>{"// SCRIET"} &bull; MEERUT</span>
          </div>
        </div>

        <div className="container-fx relative z-10 w-full pt-14 pb-24 md:pt-20 lg:pt-24 lg:pb-28">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Headline layer */}
            <div className="hero-float lg:col-span-5" style={float(18, 1.2)}>
              <div className="mb-6 animate-fade">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#00030D]/60 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-white/90">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4D82FF] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4D82FF]"></span>
                  </span>
                  <span>A Student-Led Movement</span>
                </div>
              </div>
              <h1 className="font-serif text-[clamp(2.75rem,6vw,5.25rem)] leading-[1.03] tracking-tight animate-reveal">
                <span className="text-white">Ideas Grow</span>
                <br />
                <span className="bg-gradient-to-r from-white via-[#8FB0FF] to-[#2F6BFF] bg-clip-text text-transparent">
                  Here.
                </span>
              </h1>
            </div>

            {/* Lede + actions layer */}
            <div className="lg:col-span-3 lg:pt-16">
              <div className="hero-float" style={float(14, 1)}>
                <p className="text-base text-white/80 leading-relaxed max-w-xl animate-reveal stagger-2">
                  {settings.chapter_name} brings together students, ideas, and opportunities to
                  build, research, and create real-world impact — together.
                </p>
              </div>
              <div className="hero-float mt-7" style={float(15, 1.4)}>
                <div className="flex flex-wrap gap-3 lg:flex-col lg:items-stretch animate-reveal stagger-3">
                  <LinkButton
                    href="/programs"
                    size="lg"
                    className="rounded-full bg-[#004DF6] hover:bg-[#1A5DFF] text-white border border-white/15 shadow-[0_0_24px_rgba(0,77,246,0.45)] focus-visible:outline-white"
                  >
                    Explore Programs <ArrowRight size={16} />
                  </LinkButton>
                  <LinkButton
                    href="/join"
                    variant="secondary"
                    size="lg"
                    className="rounded-full border-white/30 bg-[#00030D]/50 text-white hover:border-white/70 hover:bg-white/10 focus-visible:outline-white"
                  >
                    Join the Network
                  </LinkButton>
                </div>
              </div>
            </div>

            {/* Floating panels */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <div className="hero-float" style={float(10, 2.2)}>
                <div className="hud-panel p-5 animate-slide-right stagger-3">
                  <div className="hud-panel__tag">
                    <span>FX-01</span>
                    <span>{"// NETWORK"}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Terminal size={18} className="text-[#6C9BFF] shrink-0" />
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <span className="text-white">Learn.</span>
                      <span className="text-[#6C9BFF]">&bull;</span>
                      <span className="text-white">Build.</span>
                      <span className="text-[#6C9BFF]">&bull;</span>
                      <span className="text-white">Research.</span>
                      <span className="text-[#6C9BFF]">&bull;</span>
                      <span className="text-[#8FB0FF] font-bold">Impact.</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/75 leading-relaxed font-sans">
                    A network where campus conversations turn into working projects, documented
                    research, and outcomes that outlast a single event.
                  </p>
                  <div className="mt-3 pt-3 border-t border-white/12 flex items-center justify-between text-[10px] font-mono text-white/60 uppercase tracking-wider">
                    <span>Student Innovation &amp; Research</span>
                    <span className="text-[#8FB0FF] font-bold">SCRIET &bull; CCSU</span>
                  </div>
                </div>
              </div>

              {/* Readouts — real counts only */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 pl-1 animate-reveal stagger-4">
                {stats.map((s, i) => (
                  <div key={s.label} className="hero-float" style={float(12 + (i % 2), 0)}>
                    <div className="hud-readout">
                      <p className="font-mono text-[10px] tracking-wider text-[#8FB0FF] font-bold uppercase">
                        {s.label}
                      </p>
                      <AnimatedCounter value={s.value} className="font-serif text-2xl font-bold text-white block" />
                      <p className="font-mono text-[9px] text-white/55 tracking-widest uppercase font-semibold">
                        {s.code}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="hero-float" style={float(13, 0)}>
                  <div className="hud-readout">
                    <p className="font-mono text-[10px] tracking-wider text-[#8FB0FF] font-bold uppercase">Impact</p>
                    <p className="font-serif text-2xl font-bold text-[#6C9BFF]">&infin;</p>
                    <p className="font-mono text-[9px] text-white/55 tracking-widest uppercase font-semibold">
                      CAMPUS LEGACY
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Nearest layer: rides furthest */}
          <div className="mt-10 lg:mt-14 flex lg:justify-end">
            <div className="hero-float w-full max-w-[420px]" style={float(22, 2.4)}>
              <div className="hud-panel p-5 animate-reveal stagger-5">
                <div className="hud-panel__tag">
                  <span>FX-02</span>
                  <span>{"// CORE DOMAINS"}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {coreAreas.map((a) => (
                    <span
                      key={a}
                      className="font-mono text-xs px-2.5 py-1 rounded border border-white/15 bg-[#00030D]/60 text-white/85 hover:border-[#6C9BFF] hover:text-[#8FB0FF] transition-colors"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          MARQUEE — Continuous Activity Strip
          ================================================================ */}
      <section className="border-y border-cyan-500/20 bg-surface/50 overflow-hidden select-none" aria-hidden>
        <div className="py-3">
          <div className="marquee-track gap-8 text-[11px] uppercase tracking-[0.2em] font-mono font-semibold text-cyan-500/70">
            {[...Array(3)].map((_, setIdx) => (
              <div key={setIdx} className="flex items-center gap-8 px-4">
                {["Build", "Research", "Innovate", "Collaborate", "Compete", "Prototype", "Publish", "Launch"].map((word) => (
                  <span key={`${setIdx}-${word}`} className="flex items-center gap-3 whitespace-nowrap">
                    <span className="text-cyan-400 animate-pulse">✦</span> {word}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          CIRCUIT PIPELINE — Cyber Visual Flow
          ================================================================ */}
      <ScrollReveal>
        <Section className="py-12 md:py-16">
          <div className="hud-corner cyber-card energy-line rounded-sm p-6 md:p-8 overflow-x-auto">
            <div className="flex items-center justify-between mb-4 border-b border-ink/10 pb-3">
              <span className="font-mono text-xs uppercase tracking-widest text-cyan-500 font-bold">
                {"// SYSTEM PIPELINE: IDEA TO IMPACT"}
              </span>
              <span className="font-mono text-[10px] text-ink/45 uppercase tracking-widest">
                STAGE_PROGRESSION: CONTINUOUS
              </span>
            </div>
            <div className="flex items-center gap-4 md:gap-6 min-w-max text-sm font-medium">
              {["Idea", "Team", "Build", "Research", "Impact"].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-4 md:gap-6">
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-sm border border-cyan-500/30 bg-paper/90 text-ink/90 whitespace-nowrap hover:border-cyan-400 hover:text-cyan-500 transition-all shadow-sm">
                    <span className="font-mono text-[10px] text-cyan-500 font-bold">
                      0{i + 1}
                    </span>
                    <span className="font-sans font-medium">{step}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight size={16} className="text-cyan-500/40 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>
      </ScrollReveal>

      {/* ================================================================
          WHAT IS FUSIONX — Technical Split Overview
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="hud-corner cyber-card p-8 md:p-12 rounded-sm">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-5">
                <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-2">
                  {"// ABOUT PROTOCOL"}
                </p>
                <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-ink leading-tight">
                  An ecosystem, not just a club.
                </h2>
              </div>
              <div className="lg:col-span-7">
                <p className="text-base md:text-lg text-ink/75 leading-relaxed">
                  FusionX@SCRIET exists to help students move beyond attending events — into
                  actually building projects, conducting research, protecting their ideas, and carrying
                  work forward past a single competition.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </Section>

      {/* ================================================================
          BUILT BEYOND EVENTS — Pipeline Breakdown
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// ARCHITECTURE"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                The full pipeline, not a single weekend.
              </h2>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="flex flex-wrap gap-2.5 mt-6">
            {buildPipeline.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2.5">
                <span className="font-mono text-xs px-3 py-1.5 rounded-sm border border-cyan-500/25 bg-surface/80 text-ink/85 hover:border-cyan-400 transition-colors">
                  {stage}
                </span>
                {i < buildPipeline.length - 1 && (
                  <ArrowRight size={14} className="text-cyan-400/40" />
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-8 pt-6 border-t border-ink/10 flex flex-wrap gap-2">
            {journeyStages.map((stage, idx) => (
              <span
                key={stage}
                className="font-mono text-xs text-ink/50 px-3 py-1 border-l border-cyan-500/30 first:border-l-0 hover:text-cyan-500 transition-colors"
              >
                <span className="text-cyan-500/60 mr-1.5 font-bold">0{idx + 1}</span>
                {stage}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* ================================================================
          CORE AREAS — Five Ways to Get Involved
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// MODULES"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                Five ways to get involved.
              </h2>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
          {coreAreas.map((area, i) => (
            <ScrollReveal key={area} delay={i * 80}>
              <div className="hud-corner cyber-card rounded-sm p-6 group h-full flex flex-col justify-between">
                <div>
                  <div className="text-cyan-500 mb-4 p-2.5 rounded-sm bg-cyan-950/20 border border-cyan-500/20 w-fit group-hover:scale-110 group-hover:border-cyan-400 transition-all">
                    {areaIcons[area]}
                  </div>
                  <span className="font-mono text-[10px] text-ink/35 block mb-1">
                    TRACK_0{i + 1}
                  </span>
                  <p className="font-serif text-lg font-medium text-ink group-hover:text-cyan-500 transition-colors">
                    {area}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-ink/8 flex items-center justify-between text-[10px] font-mono text-cyan-500 font-semibold">
                  <span>ACTIVE</span>
                  <span>&rarr;</span>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ================================================================
          PROGRAMS PREVIEW — Structured Tracks
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// TRACKS"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                Structured tracks for every stage of the journey.
              </h2>
              <p className="mt-2 text-sm text-ink/65 max-w-xl">
                Six focused programs, each built around a different part of the idea-to-impact pipeline.
              </p>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-5 mt-8">
          {programs.map((p, i) => (
            <ScrollReveal key={p.slug} delay={i * 70}>
              <div className="hud-corner cyber-card rounded-sm p-6 group h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] tracking-wider text-cyan-500 font-bold uppercase">
                      [ PRG_0{i + 1} ]
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/50 group-hover:bg-cyan-400" />
                  </div>
                  <p className="font-serif text-xl font-medium text-ink group-hover:text-cyan-500 transition-colors">
                    {p.name}
                  </p>
                  <p className="mt-3 text-sm text-ink/65 leading-relaxed font-sans">{p.summary}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="mt-8">
            <LinkButton
              href="/programs"
              variant="secondary"
              size="sm"
              className="border-cyan-500/30 text-ink hover:border-cyan-400/70 hover:bg-cyan-950/20"
            >
              View all programs <ArrowRight size={14} />
            </LinkButton>
          </div>
        </ScrollReveal>
      </Section>

      {/* ================================================================
          PROJECTS PREVIEW — What Students are Building
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// SHOWCASE"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                What students are building right now.
              </h2>
            </div>
          </div>
        </ScrollReveal>

        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5 mt-6">
            {projects.map((p, i) => (
              <ScrollReveal key={p.id} delay={i * 80}>
                <div className="hud-corner cyber-card rounded-sm p-6 h-full flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/20 text-cyan-500 uppercase font-semibold">
                        {p.status}
                      </span>
                      {p.domain && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink/45">
                          {p.domain}
                        </span>
                      )}
                    </div>
                    <p className="font-serif text-lg font-medium text-ink group-hover:text-cyan-500 transition-colors">
                      {p.title}
                    </p>
                    <p className="mt-2 text-sm text-ink/65 line-clamp-3 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                  {p.technologies?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-ink/8 flex flex-wrap gap-1.5">
                      {p.technologies.slice(0, 4).map((t: string) => (
                        <span
                          key={t}
                          className="font-mono text-[10px] text-cyan-500 bg-cyan-950/20 border border-cyan-500/20 rounded px-2 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <div className="mt-6">
              <EmptyState
                title="No projects published yet."
                description="FusionX projects will appear here as ideas move into development."
              />
            </div>
          </ScrollReveal>
        )}

        <ScrollReveal delay={300}>
          <div className="mt-8">
            <LinkButton
              href="/projects"
              variant="secondary"
              size="sm"
              className="border-cyan-500/30 text-ink hover:border-cyan-400/70 hover:bg-cyan-950/20"
            >
              Browse all projects <ArrowRight size={14} />
            </LinkButton>
          </div>
        </ScrollReveal>
      </Section>

      {/* ================================================================
          EVENTS PREVIEW — Upcoming on the Calendar
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// TIMELINE"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                Upcoming on the calendar.
              </h2>
            </div>
          </div>
        </ScrollReveal>

        {events && events.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5 mt-6">
            {events.map((e, i) => (
              <ScrollReveal key={e.id} delay={i * 80}>
                <div className="hud-corner cyber-card rounded-sm p-6 h-full flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/20 text-cyan-500 uppercase font-semibold">
                        {e.status}
                      </span>
                    </div>
                    <p className="font-serif text-lg font-medium text-ink group-hover:text-cyan-500 transition-colors">
                      {e.title}
                    </p>
                    <p className="mt-2 text-sm text-ink/65 font-sans">
                      {new Date(e.event_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <div className="mt-6">
              <EmptyState
                title="No upcoming events scheduled yet."
                description="FusionX events will be listed here as they're announced."
              />
            </div>
          </ScrollReveal>
        )}
      </Section>

      {/* ================================================================
          FOUNDING TEAM — Built by Students
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-1">
                {"// CREATORS"}
              </p>
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink">
                Built by students, for students.
              </h2>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {founders.map((f, i) => (
            <ScrollReveal key={f.name} delay={i * 80}>
              <div className="hud-corner cyber-card rounded-sm p-6 h-full flex flex-col justify-between group">
                <div>
                  <div className="h-10 w-10 rounded-full bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center font-mono text-cyan-500 font-bold text-xs mb-4">
                    {f.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <p className="font-serif text-lg font-medium text-ink">{f.name}</p>
                  <p className="font-mono text-xs text-cyan-500 mt-1 uppercase tracking-wider font-semibold">{f.role}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="mt-8">
            <LinkButton
              href="/founders"
              variant="secondary"
              size="sm"
              className="border-cyan-500/30 text-ink hover:border-cyan-400/70 hover:bg-cyan-950/20"
            >
              Meet the full team <ArrowRight size={14} />
            </LinkButton>
          </div>
        </ScrollReveal>
      </Section>

      {/* ================================================================
          FACULTY GUIDE
          ================================================================ */}
      <Section className="pt-0">
        <ScrollReveal>
          <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-cyan-500 mb-4 font-bold">
            {"// FACULTY ADVISORY"}
          </p>
        </ScrollReveal>
        <div className="space-y-4">
          <ScrollReveal>
            <div className="hud-corner cyber-card rounded-sm p-8 md:p-10">
              <span className="font-mono text-[10px] text-cyan-500 uppercase tracking-widest block mb-2 font-bold">
                FACULTY GUIDE
              </span>
              <p className="font-serif text-2xl font-medium text-ink">{settings.faculty_guide_name}</p>
              <p className="text-sm text-ink/65 mt-1">{settings.faculty_guide_title}</p>
            </div>
          </ScrollReveal>
          {additionalFacultyGuides.map((f, i) => (
            <ScrollReveal key={f.name} delay={(i + 1) * 100}>
              <div className="hud-corner cyber-card rounded-sm p-8 md:p-10">
                <span className="font-mono text-[10px] text-cyan-500 uppercase tracking-widest block mb-2 font-bold">
                  ADDITIONAL GUIDE
                </span>
                <p className="font-serif text-2xl font-medium text-ink">{f.name}</p>
                <p className="text-sm text-ink/65 mt-1">{f.title}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ================================================================
          JOIN CTA — Futuristic Cyber Banner
          ================================================================ */}
      <Section className="pt-0 pb-24">
        <ScrollReveal>
          <div className="hud-corner relative overflow-hidden rounded-sm bg-gradient-to-br from-blue-900/30 via-surface to-cyan-950/30 border border-cyan-500/40 text-ink p-10 md:p-16 text-center shadow-[0_0_50px_rgba(6,182,212,0.15)]">
            <div className="absolute inset-0 bg-cyber-mesh opacity-30 pointer-events-none" aria-hidden />
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-cyan-500/10 rounded-full blur-[120px]" aria-hidden />

            <div className="relative z-10 max-w-xl mx-auto">
              <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-500 font-bold uppercase block mb-3">
                [ JOIN THE NETWORK ]
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-ink leading-tight">
                Don&rsquo;t just participate. Build.
              </h2>
              <p className="mt-4 text-sm md:text-base text-ink/75 leading-relaxed max-w-lg mx-auto">
                Join FusionX and become part of a network of students building, researching, and
                competing together.
              </p>
              <div className="mt-8 flex justify-center gap-4">
                <LinkButton
                  href="/join"
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-[0_0_25px_rgba(6,182,212,0.4)] border border-cyan-300/40"
                >
                  Join FusionX <ArrowRight size={16} />
                </LinkButton>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}
