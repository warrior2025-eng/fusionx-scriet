import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Countdown } from "@/components/recruitment/countdown";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getContent } from "@/lib/data/site-content";
import { istDateTime } from "@/lib/events/format";
import { cycleState, getCurrentCycle, getVisibleTeams, type CycleState } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recruitment" };

const STATE_LABEL: Record<CycleState, string> = {
  none: "Not open yet",
  upcoming: "Not open yet",
  open: "Open",
  closed: "Closed",
  results: "Results out",
};

export default async function RecruitmentPage() {
  const [page, cycle] = await Promise.all([getContent("recruitment.page"), getCurrentCycle()]);
  const state = cycleState(cycle);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const teams = cycle ? await getVisibleTeams(cycle.id) : [];
  const { data: mine } =
    cycle && user
      ? await supabase.from("recruitment_applications").select("status").eq("cycle_id", cycle.id).eq("user_id", user.id).maybeSingle()
      : { data: null };
  const applied = mine?.status === "submitted";

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx max-w-4xl pb-12 pt-20 md:pb-16 md:pt-24">
          <Eyebrow>Recruitment</Eyebrow>
          <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">{page.heading}</h1>
          {page.intro && <p className="mt-4 max-w-2xl whitespace-pre-line leading-relaxed text-ink/70">{page.intro}</p>}
          {page.difference && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
              {page.difference}{" "}
              <Link href="/join" className="font-medium text-accent">
                Join
              </Link>
              {" and "}
              <Link href="/teams" className="font-medium text-accent">
                FusionX Teams
              </Link>
            </p>
          )}
        </div>
      </section>

      <Section className="max-w-5xl">
        {!cycle ? (
          <EmptyState title="Recruitment is not open yet." description="When a recruitment cycle opens, it will be announced here." />
        ) : (
          <>
            <CutCard className="h-auto">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <Badge className="rounded-none">{STATE_LABEL[state]}</Badge>
                  <h2 className="mt-3 font-serif text-2xl text-ink md:text-3xl">{cycle.title}</h2>
                  {cycle.description && <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-ink/75">{cycle.description}</p>}
                  <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    {cycle.opens_at && (
                      <div>
                        <dt className="text-ink/60">Opens</dt>
                        <dd className="text-ink">{istDateTime(cycle.opens_at)}</dd>
                      </div>
                    )}
                    {cycle.closes_at && (
                      <div>
                        <dt className="text-ink/60">Deadline</dt>
                        <dd className="text-ink">
                          {istDateTime(cycle.closes_at)}
                          {state === "open" && (
                            <span className="ml-2 font-medium text-accent">
                              <Countdown until={cycle.closes_at} prefix="(" suffix=" left)" />
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="flex flex-col gap-2">
                  {state === "open" && !applied && (
                    <LinkButton href={user ? "/recruitment/apply" : "/login?next=/recruitment/apply"} size="lg">
                      {mine?.status === "draft" ? "Continue your application" : "Apply now"} <ArrowRight size={16} className="arrow-nudge" />
                    </LinkButton>
                  )}
                  {(applied || state === "results" || (state === "closed" && mine)) && (
                    <LinkButton href="/recruitment/status" size="lg" variant={applied ? "primary" : "secondary"}>
                      View your status <ArrowRight size={16} className="arrow-nudge" />
                    </LinkButton>
                  )}
                  {state === "upcoming" && cycle.opens_at && (
                    <p className="text-sm text-ink/70">
                      <Countdown until={cycle.opens_at} prefix="Opens in " suffix="" />
                    </p>
                  )}
                  {state === "closed" && <p className="text-sm text-ink/70">Applications are closed.</p>}
                </div>
              </div>
            </CutCard>

            <h2 className="mb-5 mt-14 font-serif text-2xl text-ink">Teams</h2>
            {teams.length === 0 ? (
              <EmptyState title="Teams will be listed here." description="The teams for this cycle have not been published yet." />
            ) : (
              <ul className="grid gap-5 md:grid-cols-2">
                {teams.map((team) => (
                  <li key={team.id}>
                    <CutCard className="flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-serif text-xl font-medium text-ink">
                          {team.emoji ? `${team.emoji} ` : ""}
                          {team.name}
                        </h3>
                        {!team.accepting_applications && <Badge className="shrink-0 rounded-none">Not taking applications</Badge>}
                      </div>
                      {team.short_description && <p className="mt-3 text-sm leading-relaxed text-ink/75">{team.short_description}</p>}
                      {team.responsibilities && (
                        <div className="mt-5">
                          <p className="text-sm font-medium text-ink">What you would do</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/75">{team.responsibilities}</p>
                        </div>
                      )}
                      {team.what_we_look_for && (
                        <div className="mt-4">
                          <p className="text-sm font-medium text-ink">What we look for</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/75">{team.what_we_look_for}</p>
                        </div>
                      )}
                      {team.seats !== null && (
                        <p className="mt-auto pt-5 text-sm text-ink/65">
                          {team.seats} seat{team.seats === 1 ? "" : "s"}
                        </p>
                      )}
                    </CutCard>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>
    </>
  );
}
