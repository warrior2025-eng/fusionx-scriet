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
import { getOrganizationSettings, approvalStatusLabel } from "@/lib/data/organization";
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

  const [{ data: projects }, { data: events }] = await Promise.all([
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
  ]);

  return (
    <>
      {/* Hero */}
      <Section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-5">
            {settings.chapter_name}
          </p>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-ink leading-[1.05]">
            Student Innovation
            <br /> &amp; Research Network
          </h1>
          <p className="mt-6 text-xl md:text-2xl font-serif text-ink/80">&ldquo;{settings.tagline}&rdquo;</p>
          <p className="mt-6 text-base text-ink/60 leading-relaxed max-w-xl">
            A student-led ecosystem for building projects, exploring research, forming
            interdisciplinary teams, participating in competitions, and turning ideas into
            meaningful outcomes.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="/about" size="lg">
              Explore FusionX <ArrowRight size={16} />
            </LinkButton>
            <LinkButton href="/join" variant="secondary" size="lg">
              Join the Network
            </LinkButton>
          </div>
        </div>

        {/* Idea -> Impact visual */}
        <div className="mt-16 border border-ink/10 rounded-sm bg-white/60 px-6 py-8 md:px-10 md:py-10 overflow-x-auto">
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
          description="FusionX @ SCRIET exists to help students move beyond attending events — into
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
            <div key={area} className="border border-ink/10 rounded-sm p-5 bg-white/50">
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
            <div key={p.slug} className="border border-ink/10 rounded-sm p-6 bg-white/50 hover:border-ink/25 transition-colors">
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
              <div key={p.id} className="border border-ink/10 rounded-sm p-6 bg-white/50">
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
              <div key={e.id} className="border border-ink/10 rounded-sm p-6 bg-white/50">
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
        <SectionHeading eyebrow="Founding Team" title="Started by three students at SCRIET." />
        <div className="grid md:grid-cols-3 gap-5">
          {founders.map((f) => (
            <div key={f.name} className="border border-ink/10 rounded-sm p-6 bg-white/50">
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
        <div className="border border-ink/10 rounded-sm bg-white/50 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-2">Faculty Guide</p>
            <p className="text-lg font-medium text-ink">{settings.faculty_guide_name}</p>
            <p className="text-sm text-ink/55 mt-1">{settings.faculty_guide_title}</p>
          </div>
          <Badge className="self-start md:self-center">{approvalStatusLabel(settings.institutional_approval)}</Badge>
        </div>
      </Section>

      {/* Join CTA */}
      <Section className="pt-0 pb-24">
        <div className="border border-ink/10 rounded-sm bg-ink text-white p-10 md:p-14 text-center">
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
