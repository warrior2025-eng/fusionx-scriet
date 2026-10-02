import Image from "next/image";
import { ArrowRight, Hammer, FlaskConical, Users, Trophy, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  founders,
  programs,
  journeyStages,
  buildPipeline,
  coreAreas,
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
    { label: "Students", value: memberCount ?? 0 },
    { label: "Projects", value: projectCount ?? 0 },
    { label: "Events", value: eventCount ?? 0 },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink/10">
        <div className="grid lg:grid-cols-2 min-h-[640px]">
          {/* Left: copy */}
          <div className="flex flex-col justify-center px-6 md:px-12 lg:px-16 py-16 lg:py-0">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-5">
              A Student-Led Movement
            </p>
            <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
              <span className="text-ink">Ideas Grow</span>
              <br />
              <span className="text-accent">Here.</span>
            </h1>
            <p className="mt-6 text-base text-ink/60 leading-relaxed max-w-md">
              {settings.chapter_name} brings together students, ideas, and opportunities to
              build, research, and create real-world impact — together.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/programs" size="lg">
                Explore Programs <ArrowRight size={16} />
              </LinkButton>
              <LinkButton href="/join" variant="secondary" size="lg">
                Join the Network
              </LinkButton>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="font-serif text-3xl text-accent">{s.value}</p>
                  <p className="text-xs text-ink/45 mt-0.5">{s.label}</p>
                </div>
              ))}
              <div>
                <p className="font-serif text-3xl text-accent">&infin;</p>
                <p className="text-xs text-ink/45 mt-0.5">Impact</p>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-ink/10 flex flex-wrap gap-x-6 gap-y-1.5 text-xs font-medium tracking-[0.1em] uppercase text-ink/40">
              {coreAreas.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          </div>

          {/* Right: visual panel — typography-driven explainer instead of a
              stock photo or abstract illustration. Swap for a real campus
              photo any time by dropping one into /public (e.g.
              public/hero-campus.jpg) and replacing this div with a Next
              <Image> pointed at it. */}
          <div className="relative min-h-[480px] lg:min-h-0 overflow-hidden bg-[#0a0e18] flex flex-col justify-between px-8 py-10 md:px-14 md:py-14">
            <div className="absolute inset-0 bg-gradient-to-br from-[#05070f] via-[#0a1330] to-[#12224f]" />
            <div
              className="absolute top-1/4 -right-10 h-80 w-80 rounded-full bg-[#2f6bff] opacity-25 blur-[120px]"
              aria-hidden
            />
            <div
              className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-[#3f6fe0] opacity-[0.15] blur-[100px]"
              aria-hidden
            />

            {/* Large watermark logo filling the empty right-hand space */}
            <Image
              src="/logo-mark.png"
              alt=""
              width={640}
              height={640}
              aria-hidden
              className="pointer-events-none select-none absolute -right-24 top-1/2 -translate-y-1/2 w-[26rem] md:w-[34rem] h-auto opacity-[0.14] mix-blend-screen"
            />

            {/* Top: brand mark */}
            <div className="relative flex items-center gap-2.5 text-white/90">
              <Image
                src="/logo-mark.png"
                alt="FusionX logo"
                width={36}
                height={36}
                className="h-9 w-9 rounded-full"
              />
              <span className="text-xs font-semibold tracking-[0.16em] uppercase">
                FusionX@SCRIET
              </span>
            </div>

            {/* Middle: big stacked typography explaining what FusionX does */}
            <div className="relative">
              {["Learn.", "Build.", "Research.", "Impact."].map((word, i) => (
                <p
                  key={word}
                  className={`font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight ${
                    i === 3 ? "text-accent" : "text-white"
                  }`}
                  style={{ opacity: 1 - i * 0.14 }}
                >
                  {word}
                </p>
              ))}
              <p className="mt-6 max-w-xs text-sm text-white/55 leading-relaxed">
                A network where campus conversations turn into working projects, documented
                research, and outcomes that outlast a single event.
              </p>
            </div>

            {/* Bottom: institution tag */}
            <div className="relative flex items-end justify-between border-t border-white/10 pt-5">
              <p className="text-xs text-white/45 max-w-[14rem] leading-relaxed">
                Student Innovation &amp; Research Network
              </p>
              <div className="text-right text-xs font-semibold tracking-[0.14em] uppercase text-white/70">
                <p>SCRIET</p>
                <p>CCS University, Meerut</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Idea -> Impact visual */}
      <Section>
        <div className="border border-ink/10 rounded-sm bg-surface px-6 py-8 md:px-10 md:py-10 overflow-x-auto">
          <div className="flex items-center gap-3 md:gap-5 min-w-max text-sm font-medium text-ink/70">
            {["Idea", "Team", "Build", "Research", "Impact"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3 md:gap-5">
                <span className="px-4 py-2 rounded-full border border-ink/15 bg-paper whitespace-nowrap">
                  {step}
                </span>
                {i < arr.length - 1 && <ArrowRight size={16} className="text-ink/25 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* What is FusionX */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="What is FusionX?"
          title="An ecosystem, not just a club."
          description="FusionX@SCRIET exists to help students move beyond attending events — into
          actually building projects, conducting research, protecting their ideas, and carrying
          work forward past a single competition."
        />
      </Section>

      {/* Built Beyond Events */}
      <Section className="pt-0">
        <SectionHeading eyebrow="Built Beyond Events" title="The full pipeline, not a single weekend." />
        <div className="flex flex-wrap gap-2.5">
          {buildPipeline.map((stage, i) => (
            <div key={stage} className="flex items-center gap-2.5">
              <Badge>{stage}</Badge>
              {i < buildPipeline.length - 1 && <ArrowRight size={14} className="text-ink/20" />}
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          {journeyStages.map((stage) => (
            <span key={stage} className="text-xs text-ink/40 px-2.5 py-1 border-l border-ink/10 first:border-l-0">
              {stage}
            </span>
          ))}
        </div>
      </Section>

      {/* Core areas */}
      <Section className="pt-0">
        <SectionHeading eyebrow="Core Areas" title="Five ways to get involved." />
        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
          {coreAreas.map((area) => (
            <div key={area} className="border border-ink/10 rounded-sm p-5 bg-surface">
              <div className="text-accent mb-3">{areaIcons[area]}</div>
              <p className="font-medium text-ink text-sm">{area}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Programs preview */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Programs"
          title="Structured tracks for every stage of the journey."
          description="Six focused programs, each built around a different part of the idea-to-impact pipeline."
        />
        <div className="grid md:grid-cols-3 gap-5">
          {programs.map((p) => (
            <div key={p.slug} className="border border-ink/10 rounded-sm p-6 bg-surface hover:border-ink/25 transition-colors">
              <p className="font-medium text-ink">{p.name}</p>
              <p className="mt-2 text-sm text-ink/55 leading-relaxed">{p.summary}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <LinkButton href="/programs" variant="secondary" size="sm">
            View all programs <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Projects preview */}
      <Section className="pt-0">
        <SectionHeading eyebrow="Projects" title="What students are building right now." />
        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div key={p.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <Badge>{p.status}</Badge>
                  {p.domain && <span className="text-xs text-ink/40">{p.domain}</span>}
                </div>
                <p className="font-medium text-ink">{p.title}</p>
                <p className="mt-1.5 text-sm text-ink/55 line-clamp-2">{p.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No projects published yet."
            description="FusionX projects will appear here as ideas move into development."
          />
        )}
        <div className="mt-8">
          <LinkButton href="/projects" variant="secondary" size="sm">
            Browse all projects <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Events preview */}
      <Section className="pt-0">
        <SectionHeading eyebrow="Events" title="Upcoming on the calendar." />
        {events && events.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5">
            {events.map((e) => (
              <div key={e.id} className="border border-ink/10 rounded-sm p-6 bg-surface">
                <Badge>{e.status}</Badge>
                <p className="mt-3 font-medium text-ink">{e.title}</p>
                <p className="mt-1.5 text-sm text-ink/55">
                  {new Date(e.event_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  {e.venue ? ` · ${e.venue}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No upcoming events scheduled yet."
            description="FusionX events will be listed here as they're announced."
          />
        )}
      </Section>

      {/* Founding team preview */}
      <Section className="pt-0">
        <SectionHeading eyebrow="Founding Team" title="Built by students, for students." />
        <div className="grid md:grid-cols-3 gap-5">
          {founders.map((f) => (
            <div key={f.name} className="border border-ink/10 rounded-sm p-6 bg-surface">
              <p className="font-medium text-ink">{f.name}</p>
              <p className="mt-1 text-sm text-accent">{f.role}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <LinkButton href="/founders" variant="secondary" size="sm">
            Meet the full team <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Faculty guide */}
      <Section className="pt-0">
        <div className="border border-ink/10 rounded-sm bg-surface p-8 md:p-10">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-2">Faculty Guide</p>
          <p className="text-lg font-medium text-ink">{settings.faculty_guide_name}</p>
          <p className="text-sm text-ink/55 mt-1">{settings.faculty_guide_title}</p>
        </div>
      </Section>

      {/* Join CTA */}
      <Section className="pt-0 pb-24">
        <div className="border border-accent/30 rounded-sm bg-accent text-white p-10 md:p-14 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Don&rsquo;t just participate. Build.</h2>
          <p className="mt-3 text-white/65 max-w-lg mx-auto">
            Join FusionX and become part of a network of students building, researching, and
            competing together.
          </p>
          <div className="mt-7">
            <LinkButton href="/join" variant="secondary" size="lg" className="border-white/30 text-white hover:border-white bg-transparent">
              Join FusionX <ArrowRight size={16} />
            </LinkButton>
          </div>
        </div>
      </Section>
    </>
  );
}
