import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateRoom } from "@/components/interview/candidate-room";
import { ResultsCountdown } from "@/components/recruitment/results-countdown";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import type { InterviewAccess } from "@/lib/interview/shared";
import { getCurrentCycle } from "@/lib/recruitment/data";
import { dayLabel, slotRange, slotTime } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interview room", robots: { index: false } };

/**
 * The FusionX Interview Room, for a candidate. The database decides (from its
 * own clock) whether they may be here: a live booking, on a day switched to
 * the in-website room, inside the window. Everyone else is sent the right way.
 */
export default async function InterviewRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/recruitment/interview");

  const cycle = await getCurrentCycle();
  const { data, error } = cycle ? await supabase.rpc("my_interview_access", { p_cycle: cycle.id }) : { data: null, error: null };
  const access: InterviewAccess = !error && data ? (data as InterviewAccess) : { state: "none" };

  const message = (title: string, body: string, action?: React.ReactNode) => (
    <CutCard className="h-auto">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink/75">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </CutCard>
  );
  const back = (
    <LinkButton href="/recruitment/status" variant="secondary" size="sm">
      Go to your status page
    </LinkButton>
  );

  return (
    <Section className="max-w-4xl pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Interview room</h1>
      <div className="mt-8">
        {access.state === "open" ? (
          <CandidateRoom access={access} />
        ) : access.state === "too_early" ? (
          <CutCard className="h-auto">
            <p className="font-medium text-ink">Your interview room opens soon</p>
            <p className="mt-2 text-sm text-ink/75">
              {dayLabel(access.day)}, {slotRange(access.starts_at, access.ends_at)} IST. You can join from{" "}
              {slotTime(access.opens_at)}. This page opens the room by itself.
            </p>
            <ResultsCountdown until={access.opens_at} className="mt-5" />
          </CutCard>
        ) : access.state === "ended" ? (
          message("Your slot has ended", "The interview room for your slot has closed. Missed interviews cannot be rescheduled.", back)
        ) : access.state === "meet" ? (
          message("Your interview is on Google Meet", "Your interview day uses Google Meet. The link appears on your status page on the day of your interview.", back)
        ) : access.state === "offline" ? (
          message("Your interview is in person", "Your interview day is in person. The venue and time are on your status page.", back)
        ) : (
          message("No interview booked", "You need an interview slot to use the interview room.", back)
        )}
      </div>
    </Section>
  );
}
