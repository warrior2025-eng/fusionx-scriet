import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateRoom } from "@/components/interview/candidate-room";
import { RoomCountdown } from "@/components/interview/room-countdown";
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
 * On the interview date a candidate who comes early gets the room page in its
 * waiting state (device check, rules, phone QR, then a countdown); before the
 * date, only the date and a countdown.
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
        {access.state === "open" || (access.state === "too_early" && access.today) ? (
          <CandidateRoom access={access} />
        ) : access.state === "too_early" ? (
          <CutCard className="h-auto">
            <p className="font-medium text-ink">
              Your interview room opens on {dayLabel(access.day)} at {slotTime(access.opens_at)}
            </p>
            <p className="mt-2 text-sm text-ink/75">
              Your slot: {slotRange(access.starts_at, access.ends_at)} IST. Come back to this page on the day; it opens the room by itself.
            </p>
            <RoomCountdown until={access.opens_at} serverNow={access.now} className="mt-5" />
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
