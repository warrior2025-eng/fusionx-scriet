import type { Metadata } from "next";
import Link from "next/link";
import { Pill } from "@/components/admin/ui";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { JoinForm } from "@/components/forms/join-form";
import { createClient } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { siteName } from "@/lib/site-config";
import { getOrganizationSettings } from "@/lib/data/organization";
import { pageMetadata } from "@/lib/data/seo";
import { getContent } from "@/lib/data/site-content";
import { eventDate, isPast, istDateTime } from "@/lib/events/format";
import { cycleState, getCurrentCycle } from "@/lib/recruitment/data";
import { getTeamSettings } from "@/lib/teams/data";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("join", { title: "Join FusionX", description: `Apply to join ${siteName}.` });

// What an applicant is told about their own application.
const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" }> = {
  submitted: { label: "Pending", tone: "warn" },
  under_review: { label: "Pending", tone: "warn" },
  shortlisted: { label: "Pending", tone: "warn" },
  selected: { label: "Approved", tone: "good" },
  rejected: { label: "Not approved", tone: "bad" },
  archived: { label: "Closed", tone: "neutral" },
};

export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [settings, page, joinSettings, cycle, teamSettings] = await Promise.all([
    getOrganizationSettings(),
    getContent("join.page"),
    getContent("join.settings"),
    getCurrentCycle(),
    getTeamSettings(),
  ]);
  const open = settings.join_open && !isPast(joinSettings.deadline);

  // The applicant's own applications (row level security returns no one else's).
  const { data: mine } = user
    ? await supabase.from("applications").select("id, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3)
    : { data: null };

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16 max-w-3xl">
          <ScrollReveal>
            <Eyebrow>Join FusionX</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink mb-4">{page.heading}</h1>
            {page.intro && <p className="text-base text-ink/55 leading-relaxed whitespace-pre-line">{page.intro}</p>}
            {open && joinSettings.deadline && <p className="mt-3 text-sm text-ink/70">Applications close on {istDateTime(joinSettings.deadline)}.</p>}
          </ScrollReveal>
        </div>
      </section>

      <Section className="max-w-3xl space-y-6">
        {mine && mine.length > 0 && (
          <div className="border border-line bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">Your application</h2>
            <ul className="mt-3 divide-y divide-line">
              {mine.map((application) => {
                const status = STATUS[application.status as string] ?? STATUS.submitted;
                return (
                  <li key={application.id as string} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm text-ink">
                    <span>Sent on {eventDate(String(application.created_at).slice(0, 10))}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ScrollReveal delay={100}>
          <div className="card-elevated rounded-sm p-8 md:p-10">
            {open ? (
              <JoinForm isSignedIn={!!user} />
            ) : (
              <div>
                <p className="font-medium text-ink">Applications are closed</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/70">
                  {settings.join_closed_message?.trim() ||
                    "We aren’t taking new applications right now. Please check back later."}
                </p>
              </div>
            )}
          </div>
        </ScrollReveal>

        {/* The other two ways in, so nobody fills in the wrong form. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {cycleState(cycle) === "open" && (
            <Link href="/recruitment" className="card-elevated block p-5">
              <p className="font-medium text-ink">Recruitment is open</p>
              <p className="mt-1 text-sm text-ink/70">Apply to work in one of FusionX&rsquo;s own teams.</p>
            </Link>
          )}
          {teamSettings.open && (
            <Link href="/teams/register" className="card-elevated block p-5">
              <p className="font-medium text-ink">Register your team</p>
              <p className="mt-1 text-sm text-ink/70">Already have a project team, or forming one? Register it with FusionX Teams.</p>
            </Link>
          )}
        </div>
      </Section>
    </>
  );
}
