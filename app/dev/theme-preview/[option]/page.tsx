import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Pill } from "@/components/admin/ui";
import { FusionXHero } from "@/components/hero/fusionx-hero";
import { SiteFooter } from "@/components/navigation/site-footer";
import { SiteHeader } from "@/components/navigation/site-header";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { DateBlock } from "@/components/ui/date-block";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { Section, SectionHeading } from "@/components/ui/section";
import { Stepper } from "@/components/ui/stepper";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getContent } from "@/lib/data/site-content";
import { buildPipeline, programs } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { OPTIONS, previewAllowed, type OptionKey } from "../guard";
import { PreviewTheme } from "../preview-theme";
import "../preview.css";

export const metadata: Metadata = { title: "Light theme preview", robots: { index: false, follow: false } };

const float = (pd: number, pr: number) => ({ "--pd": pd, "--pr": pr }) as React.CSSProperties;

/**
 * One option of the light theme, shown on the site's real components: the
 * header, the home hero with its Activity panel, a section heading, program
 * and event cards, the stepper, buttons, badges, a form and the footer.
 * The event and the form values are placeholders, labelled as such.
 */
export default async function ThemeSpecimenPage({ params }: { params: Promise<{ option: string }> }) {
  const { option } = await params;
  if (!previewAllowed() || !(option in OPTIONS)) notFound();
  const key = option as OptionKey;
  const { hero, join } = OPTIONS[key];
  const navyHero = hero === "night";

  const supabase = await createClient();
  const [settings, footerColumns, { data: memberCount }, { count: projectCount }, { count: eventCount }] = await Promise.all([
    getOrganizationSettings(),
    getContent("footer.columns"),
    supabase.rpc("get_member_count"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("is_published", true),
  ]);
  const stats = [
    { label: "Students", value: typeof memberCount === "number" ? memberCount : 0 },
    { label: "Projects", value: projectCount ?? 0 },
    { label: "Events", value: eventCount ?? 0 },
  ];

  return (
    <>
      {/* Set before first paint, so the frame never flashes the dark theme. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-lt','${key}');`,
        }}
      />
      <PreviewTheme option={key} />

      <SiteHeader chapterName={settings.chapter_name} subtitle={settings.subtitle} logoUrl={settings.logo_path} user={null} />

      <main className="flex-1">
        {/* ── Hero, with the Activity panel ── */}
        <section
          id="lt-hero"
          data-scene-window
          className={cn("lt-hero relative flex min-h-[640px] items-center overflow-hidden", navyHero && "on-navy")}
        >
          <FusionXHero floatTarget="#lt-hero" theme={navyHero ? "dark" : undefined} />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/80 via-paper/55 to-transparent lg:bg-gradient-to-r lg:from-paper/85 lg:via-paper/45 lg:to-transparent"
            aria-hidden
          />
          <div className="container-fx relative w-full py-16 md:py-20">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-7">
                <div className="hero-float" style={float(18, 1.2)}>
                  <Eyebrow>A Student-Led Movement</Eyebrow>
                  <h1 className="font-serif text-[clamp(2.75rem,7vw,5.75rem)] leading-[1.02] tracking-tight text-ink">
                    Ideas <span className="accent-large text-accent">Grow</span>
                    <br />
                    Here.
                  </h1>
                </div>
                <div className="hero-float mt-7" style={float(14, 1)}>
                  <p className="max-w-xl text-base leading-relaxed text-ink/85 md:text-lg">
                    {settings.chapter_name} brings together students, ideas, and opportunities to build, research, and
                    create real-world impact, together.
                  </p>
                </div>
                <div className="hero-float mt-9" style={float(15, 1.4)}>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <LinkButton href="/programs" size="lg">
                      Explore Programs <ArrowRight size={16} className="arrow-nudge" />
                    </LinkButton>
                    <LinkButton href="/join" variant="secondary" size="lg" className="bg-paper/60">
                      Join the Network
                    </LinkButton>
                  </div>
                </div>
                <div className="hero-float lt-island mt-10 sm:max-w-md" style={float(12, 0)}>
                  <CutCard className="lt-activity p-5 md:p-6">
                    <Eyebrow>Activity</Eyebrow>
                    <dl className="grid grid-cols-3 divide-x divide-line">
                      {stats.map((s) => (
                        <div key={s.label} className="flex flex-col-reverse px-4 first:pl-0 last:pr-0 sm:px-5">
                          <dt className="mt-1 text-sm text-ink/70">{s.label}</dt>
                          <dd>
                            <AnimatedCounter value={s.value} className="block font-serif text-3xl font-medium tabular-nums text-ink md:text-4xl" />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CutCard>
                </div>
              </div>
              <div className="lg:col-span-5">
                <div className="hero-float lt-island" style={float(22, 2.4)}>
                  <CutCard>
                    <p className="font-serif text-2xl leading-snug text-ink md:text-[1.75rem]">Learn. Build. Research. Impact.</p>
                    <p className="mt-4 leading-relaxed text-ink/80">
                      A network where campus conversations turn into working projects, documented research, and outcomes
                      that outlast a single event.
                    </p>
                    <p className="mt-5 border-t border-line pt-5 text-sm text-ink/65">Student Innovation &amp; Research, SCRIET, CCSU</p>
                  </CutCard>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section heading + program cards ── */}
        <Section band="surface">
          <SectionHeading
            index={1}
            eyebrow="Programs"
            title="Structured tracks for every stage of the journey."
            description="Focused programs, each built around a different part of the idea-to-impact pipeline."
            action={
              <LinkButton href="/programs" variant="secondary" size="sm">
                View all programs <ArrowRight size={14} className="arrow-nudge" />
              </LinkButton>
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programs.slice(0, 3).map((p) => (
              <CutCard key={p.slug} interactive className="flex flex-col">
                <h3 className="font-serif text-xl font-medium text-ink">{p.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/75">{p.summary}</p>
                <Link href={`/programs#${p.slug}`} className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-accent">
                  <span className="link-slide">Learn more</span>
                  <ArrowRight size={14} className="arrow-nudge" />
                </Link>
              </CutCard>
            ))}
          </div>
        </Section>

        {/* ── Stepper + event card ── */}
        <Section band="tint">
          <SectionHeading index={2} eyebrow="Idea to impact" title="The full pipeline, not a single weekend." />
          <CutCard className="p-8 md:p-10">
            <Stepper steps={buildPipeline} label="Idea to impact pipeline" />
          </CutCard>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <CutCard className="flex gap-4">
              <DateBlock date="2026-11-14" />
              <div className="min-w-0 pr-2">
                <Badge className="rounded-none capitalize">upcoming</Badge>
                <h3 className="mt-3 font-serif text-lg font-medium text-ink">
                  <Link href="#" className="hover:underline">
                    Sample event (preview only)
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-ink/70">Venue name</p>
              </div>
            </CutCard>
          </div>
        </Section>

        {/* ── Buttons, badges, a form ── */}
        <Section>
          <SectionHeading index={3} eyebrow="Components" title="Buttons, badges and forms." />
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-8">
              <div>
                <p className="mb-3 text-sm font-medium text-ink/70">Buttons</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-ink/70">Badges and status</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Info</Badge>
                  <Pill tone="good">Live</Pill>
                  <Pill tone="good">Completed</Pill>
                  <Pill tone="warn">Upcoming</Pill>
                  <Pill tone="warn">Pending</Pill>
                  <Pill tone="bad">Closed</Pill>
                  <Pill tone="bad">Cancelled</Pill>
                  <Pill>Draft</Pill>
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-ink/70">Text</p>
                <p className="text-ink">Heading and body text in navy.</p>
                <p className="mt-1 text-ink/70">Muted text, used for descriptions and labels.</p>
                <p className="mt-1 text-sm text-ink/45">Small hint text, the faintest step.</p>
                <p className="mt-2 text-sm">
                  <Link href="#" className="font-medium text-accent">
                    A text link
                  </Link>
                </p>
              </div>
            </div>
            <CutCard>
              <form className="space-y-5">
                <div>
                  <Label htmlFor="lt-name">Name</Label>
                  <Input id="lt-name" placeholder="Your full name" />
                  <FieldHint>As it should appear on your certificate.</FieldHint>
                </div>
                <div>
                  <Label htmlFor="lt-email">Email</Label>
                  <Input id="lt-email" type="email" defaultValue="not-an-email" className="border-red-500" aria-invalid />
                  <FieldError>Enter a valid email address.</FieldError>
                </div>
                <div>
                  <Label htmlFor="lt-message">Message</Label>
                  <Textarea id="lt-message" rows={3} placeholder="What would you like to build?" />
                </div>
                <Button type="button">Send message</Button>
              </form>
            </CutCard>
          </div>
        </Section>

        {/* ── Brand band ── */}
        <Section band={join} id="lt-join">
          <Eyebrow>Join the network</Eyebrow>
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Don&rsquo;t just participate. Build.</h2>
              <p className="mt-4 leading-relaxed text-ink/75">
                Join FusionX and become part of a network of students building, researching, and competing together.
              </p>
            </div>
            <LinkButton href="/join" size="lg" variant={key === "b" || key === "c" ? "secondary" : "primary"}>
              Join FusionX <ArrowRight size={16} className="arrow-nudge" />
            </LinkButton>
          </div>
        </Section>
      </main>

      <SiteFooter settings={settings} columns={footerColumns} />
    </>
  );
}
