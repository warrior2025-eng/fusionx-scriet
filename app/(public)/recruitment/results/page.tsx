import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ResultsCountdown } from "@/components/recruitment/results-countdown";
import { ResultsLists } from "@/components/recruitment/results-lists";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { getCurrentCycle, getPublicResults } from "@/lib/recruitment/data";
import { announcement, announceWhen } from "@/lib/recruitment/results";

export const metadata: Metadata = { title: "Recruitment results" };

/**
 * The public announcement. Rendered for every request: the database answers
 * "pending" (the date only) until the publish time, and the names after it.
 */
export default async function RecruitmentResultsPage() {
  await connection();
  const cycle = await getCurrentCycle();
  const results = cycle ? await getPublicResults(cycle.id) : ({ state: "none" } as const);
  // The first visit after the time may be what published the results: send their emails too.
  if (results.state === "published" && results.just_published) deliverEmailsAfterResponse();

  return (
    <Section className="max-w-5xl pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Recruitment results</h1>
      {cycle && <p className="mt-2 text-sm text-ink/70">{cycle.title}</p>}

      <div className="mt-8">
        {results.state === "none" ? (
          <EmptyState title="No results yet." description="When recruitment results are announced, they will appear here." />
        ) : results.state === "pending" ? (
          <CutCard className="h-auto">
            <p className="leading-relaxed text-ink">{announcement(results.publish_at)}</p>
            {results.publish_at && results.scheduled && <ResultsCountdown until={results.publish_at} className="mt-6" />}
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/recruitment/status" size="sm" variant="secondary">
                Your application
              </LinkButton>
            </div>
          </CutCard>
        ) : (
          <>
            <p className="mb-6 max-w-3xl text-sm leading-relaxed text-ink/75">
              {results.publish_at ? `Announced on ${announceWhen(results.publish_at)} IST. ` : ""}
              Congratulations to everyone selected. If you applied, your own result is on{" "}
              <Link href="/recruitment/status" className="font-medium text-accent underline underline-offset-2">
                your status page
              </Link>
              .
            </p>
            <ResultsLists results={results} />
          </>
        )}
      </div>
    </Section>
  );
}
