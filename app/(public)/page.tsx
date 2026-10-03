import Image from "next/image";
import { ArrowRight, Hammer, FlaskConical, Users, Trophy, Sparkles, Terminal, Cpu, Flame, ShieldCheck, Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TechMarquee } from "@/components/ui/tech-marquee";
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

const areaDescriptions: Record<string, string> = {
  Build: "Rapid hardware & software prototyping, dev labs, and production-ready applications.",
  Research: "Literature discovery, empirical experimentation, IEEE paper drafting, and peer review.",
  Connect: "Cross-departmental collaboration, multi-skill team formation, and peer-to-peer mentoring.",
  Compete: "National tech fests, Smart India Hackathon, ICPC, and tier-1 innovation challenges.",
  Create: "Creative technology, generative UI, design engineering, and media technology.",
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

  const stats = [
    { label: "Students", value: memberCount ?? 0, sub: "Registered Members" },
    { label: "Projects", value: projectCount ?? 0, sub: "Active Repos" },
    { label: "Events", value: eventCount ?? 0, sub: "Conducted & Live" },
  ];

  return (
    <>
      {/* Hero Section — Techfest & Cognizance Futuristic Aesthetic */}
      <section className="relative overflow-hidden border-b border-ink/10 bg-cyber-grid">
        {/* Ambient Neon Glow Spotlights */}
        <div className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[130px]" aria-hidden />
        <div className="pointer-events-none absolute top-1/2 -right-20 h-96 w-96 rounded-full bg-cyan-500/15 blur-[140px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-indigo-600/15 blur-[110px]" aria-hidden />

        <div className="grid lg:grid-cols-12 min-h-[640px] relative z-10">
          {/* Left: Futuristic Hero Copy (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-center px-6 md:px-12 lg:px-16 py-16 lg:py-20">
            {/* Live Telemetry Pill */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/30 backdrop-blur-md mb-6 w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
              </span>
              <span className="text-[11px] font-mono tracking-widest uppercase text-cyan-300 font-semibold">
                SCRIET MEERUT &bull; INNOVATION &amp; TECH ECOSYSTEM
              </span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
              <span className="text-white">Ideas That Defy</span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                Limits &amp; Boundaries.
              </span>
            </h1>

            <p className="mt-6 text-base md:text-lg text-ink/70 leading-relaxed max-w-xl">
              {settings.chapter_name} brings together students, engineers, and researchers to
              engineer scalable prototypes, write high-impact research, and compete on the grandest
              national stages.
            </p>

            {/* Glowing CTAs */}
            <div className="mt-8 flex flex-wrap gap-4">
              <LinkButton href="/programs" size="lg" className="shadow-[0_0_25px_rgba(47,107,255,0.45)] hover:shadow-[0_0_35px_rgba(47,107,255,0.65)] transition-all">
                Explore Programs <ArrowRight size={16} />
              </LinkButton>
              <LinkButton href="/join" variant="secondary" size="lg" className="border-cyan-500/30 text-ink hover:border-cyan-400/70 hover:bg-cyan-950/20 backdrop-blur-sm transition-all">
                Join the Network
              </LinkButton>
            </div>

            {/* Telemetry Stats Grid */}
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
              {stats.map((s) => (
                <div key={s.label} className="hud-corner tech-card p-3.5 rounded-sm">
                  <p className="text-[10px] font-mono tracking-wider uppercase text-cyan-400/80">{s.label}</p>
                  <p className="font-serif text-3xl font-bold text-white mt-0.5">{s.value}</p>
                  <p className="text-[10px] text-ink/40 mt-1">{s.sub}</p>
                </div>
              ))}
              <div className="hud-corner tech-card p-3.5 rounded-sm">
                <p className="text-[10px] font-mono tracking-wider uppercase text-cyan-400/80">Impact</p>
                <p className="font-serif text-3xl font-bold text-cyan-300 mt-0.5">&infin;</p>
                <p className="text-[10px] text-ink/40 mt-1">Campus Legacy</p>
              </div>
            </div>

            {/* Core Area Badges */}
            <div className="mt-10 pt-6 border-t border-ink/10 flex flex-wrap gap-2 text-xs font-mono tracking-wider uppercase text-ink/50">
              <span className="text-cyan-400/70 mr-1">// CORE DOMAINS:</span>
              {coreAreas.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded border border-ink/10 bg-surface/40 text-ink/75 hover:border-accent/40 transition-colors">
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Futuristic HUD Terminal Display (5 cols) */}
          <div className="lg:col-span-5 relative min-h-[480px] lg:min-h-0 overflow-hidden bg-[#070b14]/90 flex flex-col justify-between px-8 py-10 md:px-12 md:py-12 border-l border-ink/10">
            {/* Background elements & Watermark */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#05070f] via-[#091430] to-[#0f1f45]" />
            <div className="pointer-events-none absolute top-1/4 -right-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-[100px]" aria-hidden />

            <Image
              src="/logo-mark.png"
              alt=""
              width={640}
              height={640}
              aria-hidden
              className="pointer-events-none select-none absolute -right-20 top-1/2 -translate-y-1/2 w-[28rem] h-auto opacity-[0.12] mix-blend-screen"
            />

            {/* Terminal Header */}
            <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo-mark.png"
                  alt="FusionX logo"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-cyan-400/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                />
                <div>
                  <span className="text-xs font-mono font-bold tracking-[0.16em] uppercase text-white">
                    FusionX // OS
                  </span>
                  <p className="text-[10px] font-mono text-cyan-400">STATUS: ONLINE • v2.4</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </div>

            {/* Futuristic Stacked Pillars */}
            <div className="relative my-8 space-y-3">
              {[
                { word: "01. LEARN", desc: "Foundational masterclasses & skill acceleration", color: "text-white" },
                { word: "02. BUILD", desc: "Prototypes, codebases & engineering labs", color: "text-blue-300" },
                { word: "03. RESEARCH", desc: "Scientific validation & patent discovery", color: "text-cyan-300" },
                { word: "04. IMPACT", desc: "National competitions & startup launches", color: "text-indigo-300 font-bold" },
              ].map((item, i) => (
                <div key={item.word} className="tech-card p-3 rounded border border-white/10 bg-white/[0.02] hover:border-cyan-400/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className={`font-mono text-lg tracking-wide ${item.color}`}>{item.word}</p>
                    <span className="text-[10px] font-mono text-ink/30">STAGE 0{i + 1}</span>
                  </div>
                  <p className="text-xs text-ink/60 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Bottom Institutional Seal */}
            <div className="relative flex items-center justify-between border-t border-white/10 pt-4 text-[11px] font-mono text-white/50">
              <div>
                <p className="text-white/80 font-medium">SCRIET MEERUT</p>
                <p className="text-[10px] text-white/40">Chaudhary Charan Singh University</p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded bg-accent/20 border border-accent/30 text-accent font-semibold text-[10px]">
                  STUDENT RUN
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infinite Tech Marquee — Cognizance & Techfest style */}
      <TechMarquee />

      {/* Idea -> Impact Interactive Circuit */}
      <Section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-cyber-dots opacity-30" />
        <SectionHeading
          eyebrow="The Innovation Circuit"
          title="From Raw Curiosity to Scaled Reality"
          description="How ideas progress through FusionX's engineered pipeline from campus brainstorming to national recognition."
        />

        <div className="relative mt-8">
          {/* Circuit steps grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {[
              { step: "01", name: "Problem Discovery", desc: "Identify real campus and societal friction points.", icon: <Compass size={18} className="text-blue-400" /> },
              { step: "02", name: "Team Fusion", desc: "Unite cross-departmental developers & designers.", icon: <Users size={18} className="text-cyan-400" /> },
              { step: "03", name: "Sprint & Build", desc: "Rapid prototyping in the FusionX Build Lab.", icon: <Hammer size={18} className="text-indigo-400" /> },
              { step: "04", name: "Research & IP", desc: "Prior art search, novelty documentation & papers.", icon: <ShieldCheck size={18} className="text-emerald-400" /> },
              { step: "05", name: "National Launch", desc: "Hackathons, angel pitching, and deployment.", icon: <Trophy size={18} className="text-amber-400" /> },
            ].map((s) => (
              <div key={s.step} className="hud-corner tech-card p-5 rounded-sm flex flex-col justify-between group hover:border-cyan-500/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30">
                      STEP {s.step}
                    </span>
                    {s.icon}
                  </div>
                  <p className="font-medium text-ink group-hover:text-white transition-colors">{s.name}</p>
                  <p className="mt-2 text-xs text-ink/55 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Full Pipeline Tags */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 pt-4 border-t border-ink/10">
            <span className="text-xs font-mono text-ink/40 mr-2">COMPLETE PIPELINE:</span>
            {buildPipeline.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-surface border border-ink/10 text-ink/70">
                  {stage}
                </span>
                {i < buildPipeline.length - 1 && <span className="text-cyan-400/50 text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Core Domains Showcase */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Core Domains"
          title="Five Pillars of Excellence"
          description="Whether you write code, design hardware, conduct academic research, or build businesses — there is a dedicated track for you."
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
          {coreAreas.map((area) => (
            <div key={area} className="tech-card hud-corner p-6 rounded-sm group hover:border-accent/50">
              <div className="text-accent mb-4 p-3 rounded-full bg-accent/10 w-fit group-hover:scale-110 group-hover:bg-accent/20 transition-all">
                {areaIcons[area]}
              </div>
              <p className="font-serif text-lg font-bold text-ink group-hover:text-white transition-colors">{area}</p>
              <p className="mt-2 text-xs text-ink/60 leading-relaxed">
                {areaDescriptions[area] || "Collaborate and push technological boundaries."}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Programs Preview — High Tech Cards */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Programs & Tracks"
          title="Structured Frameworks for High Performers"
          description="Six specialized cells operating year-round to turn raw talent into industry-grade outcomes."
        />
        <div className="grid md:grid-cols-3 gap-5">
          {programs.map((p, idx) => (
            <div key={p.slug} className="tech-card hud-corner p-6 rounded-sm group hover:border-cyan-500/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                  CELL 0{idx + 1}
                </span>
                <span className="text-ink/20 group-hover:text-cyan-400 transition-colors">✦</span>
              </div>
              <p className="font-serif text-lg font-bold text-ink group-hover:text-white transition-colors">{p.name}</p>
              <p className="mt-2 text-sm text-ink/60 leading-relaxed">{p.summary}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <LinkButton href="/programs" variant="secondary" size="md" className="border-cyan-500/30 hover:border-cyan-400">
            View All Program Frameworks <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Projects Preview */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Active Repositories"
          title="Engineered by Students. Verified by Results."
          description="A glimpse of what our developers, researchers, and engineers are actively shipping."
        />
        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div key={p.id} className="tech-card hud-corner p-6 rounded-sm">
                <div className="flex items-center justify-between mb-3">
                  <Badge>{p.status}</Badge>
                  {p.domain && <span className="text-xs font-mono text-cyan-400/80">{p.domain}</span>}
                </div>
                <p className="font-serif text-lg font-bold text-ink">{p.title}</p>
                <p className="mt-2 text-sm text-ink/60 line-clamp-3">{p.description}</p>
                {p.technologies && p.technologies.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-ink/10 flex flex-wrap gap-1.5">
                    {p.technologies.slice(0, 3).map((t: string) => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface text-ink/50">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Projects Initializing"
            description="FusionX repositories and prototypes will be showcased here as they are deployed."
          />
        )}
        <div className="mt-8">
          <LinkButton href="/projects" variant="secondary" size="sm">
            Browse Project Directory <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Events Preview */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Calendar & Fests"
          title="Upcoming Hackathons, Symposia & Build Sessions"
          description="Stay updated with upcoming workshops, offline hack days, and guest speaker sessions."
        />
        {events && events.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-5">
            {events.map((e) => (
              <div key={e.id} className="tech-card hud-corner p-6 rounded-sm">
                <Badge>{e.status}</Badge>
                <p className="mt-3 font-serif text-lg font-bold text-ink">{e.title}</p>
                <p className="mt-2 text-xs font-mono text-cyan-400">
                  {new Date(e.event_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  {e.venue ? ` • ${e.venue}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No events scheduled currently"
            description="Upcoming hackathons and technical bootcamps will be announced shortly."
          />
        )}
      </Section>

      {/* Founding Leadership */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Core Leadership"
          title="Founding Members"
          description="Dedicated student architects steering FusionX's vision and operations."
        />
        <div className="grid md:grid-cols-3 gap-5">
          {founders.map((f) => (
            <div key={f.name} className="tech-card hud-corner p-6 rounded-sm">
              <p className="font-serif text-lg font-bold text-ink">{f.name}</p>
              <p className="mt-1 text-xs font-mono text-cyan-400">{f.role}</p>
              <p className="mt-3 text-xs text-ink/60 leading-relaxed">{f.responsibilities}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <LinkButton href="/founders" variant="secondary" size="sm">
            Meet the Full Team <ArrowRight size={14} />
          </LinkButton>
        </div>
      </Section>

      {/* Institutional Mentorship & Faculty Guides */}
      <Section className="pt-0">
        <p className="text-xs font-mono font-semibold tracking-widest uppercase text-cyan-400 mb-4">
          // INSTITUTIONAL MENTORSHIP &amp; ADVISORS
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="tech-card hud-corner p-6 rounded-sm">
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
              FACULTY GUIDE
            </span>
            <p className="text-lg font-serif font-bold text-ink mt-2">{settings.faculty_guide_name}</p>
            <p className="text-xs text-ink/60 mt-1">{settings.faculty_guide_title}</p>
          </div>
          {additionalFacultyGuides.map((f) => (
            <div key={f.name} className="tech-card hud-corner p-6 rounded-sm">
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                ADDITIONAL FACULTY GUIDE
              </span>
              <p className="text-lg font-serif font-bold text-ink mt-2">{f.name}</p>
              <p className="text-xs text-ink/60 mt-1">{f.title}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* High-Impact Techfest Style Join Banner */}
      <Section className="pt-6 pb-24">
        <div className="relative overflow-hidden rounded-sm border border-cyan-500/30 bg-gradient-to-r from-blue-950 via-slate-900 to-cyan-950 p-10 md:p-16 text-center shadow-[0_0_50px_rgba(47,107,255,0.2)]">
          {/* Cyber ambient glow */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-cyan-500/20 blur-[100px]" aria-hidden />

          <div className="relative z-10 max-w-2xl mx-auto">
            <span className="inline-block text-[11px] font-mono font-bold tracking-widest text-cyan-400 uppercase mb-3">
              ✦ INITIALIZE YOUR JOURNEY ✦
            </span>
            <h2 className="text-3xl md:text-5xl font-serif font-bold tracking-tight text-white leading-tight">
              Don&rsquo;t Just Attend Events. <br />
              <span className="bg-gradient-to-r from-cyan-300 via-blue-200 to-indigo-300 bg-clip-text text-transparent">
                Build What&rsquo;s Next.
              </span>
            </h2>
            <p className="mt-4 text-sm md:text-base text-white/70 leading-relaxed">
              Step into SCRIET&rsquo;s most ambitious student innovation ecosystem. Form teams, build
              breakthrough projects, publish research, and represent our college at national hackathons.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <LinkButton
                href="/join"
                size="lg"
                className="bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
              >
                Join FusionX Network <ArrowRight size={16} />
              </LinkButton>
              <LinkButton
                href="/about"
                variant="secondary"
                size="lg"
                className="border-white/20 text-white hover:border-white/60 bg-white/5"
              >
                Read Manifesto
              </LinkButton>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
