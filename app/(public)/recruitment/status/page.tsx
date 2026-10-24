import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withdrawRecruitmentApplication } from "@/actions/recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { Toaster } from "@/components/admin/toast";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { istDateTime } from "@/lib/events/format";
import { agreeToAnnouncement } from "@/actions/recruitment-results";
import { InterviewCard } from "@/components/recruitment/interview-card";
import { Checklist } from "@/components/interview/checklist";
import { ReminderBanner } from "@/components/interview/reminder-banner";
import type { InterviewAccess } from "@/lib/interview/shared";
import { dayLabel, slotRange, slotTime } from "@/lib/recruitment/slots";
import { ResultView } from "@/components/recruitment/result-view";
import { ResultsCountdown } from "@/components/recruitment/results-countdown";
import { StageTimeline } from "@/components/recruitment/stage-timeline";
import { TaskCard } from "@/components/recruitment/task-card";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import {
  STAGE_LABELS,
  cycleState,
  getCurrentCycle,
  getMyBooking,
  getMyMeetLink,
  getMyResult,
  getMyTasks,
  getSlotAvailability,
  timeline,
  type Stage,
} from "@/lib/recruitment/data";
import { CONSENT_NOTICE, announcement, type MyResult } from "@/lib/recruitment/results";
import { DEFAULT_INSTRUCTIONS } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };

type StatusRow = {
  team_id: string;
  team_name: string;
  rank: number;
  stage: Stage | "in_review";
  stage_updated_at: string;
  interview_at: string | null;
  interview_location: string | null;
  final_note: string | null;
  results_out: boolean;
};

// The timeline (Applied, Shortlisted, Interview, Result, Task) comes from timeline() in lib/recruitment/stages.ts.
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

export default async function RecruitmentStatusPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/recruitment/status");
  const { submitted } = await searchParams;

  const cycle = await getCurrentCycle();
  const state = cycleState(cycle);
  const { data: application } = cycle
    ? await supabase.from("recruitment_applications").select("id, status, submitted_at").eq("cycle_id", cycle.id).eq("user_id", user.id).maybeSingle()
    : { data: null };

  const { data: statusRows } =
    cycle && application?.status === "submitted" ? await supabase.rpc("my_recruitment_status", { p_cycle: cycle.id }) : { data: null };
  const rows = (statusRows ?? []) as StatusRow[];

  // The interview slot, and where its Google Meet link stands (the link only when it may be shown).
  const active = cycle && (application?.status === "submitted" || application?.status === "draft");
  const [booking, meet, slots] = active
    ? await Promise.all([getMyBooking(cycle.id), getMyMeetLink(cycle.id), getSlotAvailability(cycle.id)])
    : [null, { state: "none" as const }, []];
  // The in-website interview room, when the admin has switched the day to it (migration 0023; nothing before it).
  const room =
    active && application?.status === "submitted"
      ? (((await supabase.rpc("my_interview_access", { p_cycle: cycle.id })).data ?? null) as InterviewAccess | null)
      : null;
  const roomCard = room && (room.state === "open" || room.state === "too_early") ? room : null;
  // The day uses the in-website room (whatever the candidate's state in it): no Google Meet wording.
  const inRoom = Boolean(room && "booking_id" in room);

  // The result: "pending" with the date until the publish time, then the decision (migration 0017).
  const result: MyResult = cycle && application?.status === "submitted" ? await getMyResult(cycle.id) : { state: "none" };
  const shown = result.state === "published" ? result : null;
  // This visit may be the one that published the results: send their emails too.
  if (shown && cycle && !cycle.results_published_at && cycle.status !== "results_published") deliverEmailsAfterResponse();
  const consent = result.state === "pending" || result.state === "published" ? result.consent : true;
  // Post-result tasks: the database returns them only to a selected candidate, after the results (migration 0021).
  const tasks = shown && cycle ? await getMyTasks(cycle.id) : [];
  const taskFor = (teamId: string) => tasks.find((t) => t.team_id === teamId);

  // Before migration 0017: the group link, only for a team this person was selected for.
  const groupLinks: Record<string, string> = {};
  if (result.state === "none") {
    for (const row of rows.filter((r) => r.results_out && r.stage === "selected")) {
      const { data: url } = await supabase.rpc("recruitment_whatsapp_link", { p_team: row.team_id });
      if (typeof url === "string" && /^https:\/\//i.test(url)) groupLinks[row.team_id] = url;
    }
  }

  const message = (title: string, body: string, action?: React.ReactNode) => (
    <CutCard className="h-auto">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </CutCard>
  );

  return (
    <Section className="max-w-3xl pt-16">
      <Toaster />
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Your application</h1>
      {cycle && <p className="mt-2 text-sm text-ink/70">{cycle.title}</p>}

      <div className="mt-8 space-y-6">
        {submitted && application?.status === "submitted" && (
          <p role="status" className="border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink">
            Your application was submitted. You will get a notification here when anything changes.
          </p>
        )}

        {!cycle || !application
          ? message(
              "You have not applied.",
              state === "open" ? "Applications are open." : "There is no application from this account for the current recruitment.",
              <LinkButton href={state === "open" ? "/recruitment/apply" : "/recruitment"} size="sm">
                {state === "open" ? "Apply now" : "Go to recruitment"}
              </LinkButton>,
            )
          : application.status === "draft"
            ? message(
                "Your application is a draft.",
                state === "open" ? "It has not been submitted yet." : "Applications closed before it was submitted.",
                state === "open" && (
                  <LinkButton href="/recruitment/apply" size="sm">
                    Continue your application
                  </LinkButton>
                ),
              )
            : application.status === "withdrawn"
              ? message(
                  "You withdrew your application.",
                  state === "open" ? "You can apply again while applications are open." : "Applications are closed.",
                  state === "open" && (
                    <LinkButton href="/recruitment/apply" size="sm">
                      Apply again
                    </LinkButton>
                  ),
                )
              : null}

        {shown && cycle && <ResultView result={shown} cycleId={cycle.id} />}

        {tasks.map((task) => (
          <TaskCard key={task.team_id} task={task} />
        ))}

        {/* After the results: where each hub got to, ending at Task for the hub they were selected into. */}
        {shown &&
          rows.map((row) => (
            <CutCard key={row.team_id} className="h-auto">
              <p className="text-sm text-ink/65">{ORDINALS[row.rank - 1] ?? row.rank} choice</p>
              <h2 className="mt-1 font-serif text-xl font-medium text-ink">{row.team_name}</h2>
              <StageTimeline
                label={`Progress for ${row.team_name}`}
                steps={timeline({
                  stage: row.stage === "not_selected" && shown.outcome === "absent" ? "absent" : row.stage,
                  resultsOut: true,
                  taskDone: (taskFor(row.team_id)?.status ?? "not_started") !== "not_started",
                })}
              />
            </CutCard>
          ))}

        {result.state === "pending" && (
          <CutCard className="h-auto">
            <p className="text-sm text-ink/65">Results</p>
            <p className="mt-2 leading-relaxed text-ink">{announcement(result.publish_at)}</p>
            {result.publish_at && result.scheduled && <ResultsCountdown until={result.publish_at} className="mt-5" />}
          </CutCard>
        )}

        {!consent && cycle && (
          <div className="border border-line bg-accent-soft px-4 py-4">
            <p className="text-sm leading-relaxed text-ink">{CONSENT_NOTICE}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ActionButton variant="primary" action={agreeToAnnouncement.bind(null, cycle.id)}>
                I agree
              </ActionButton>
              <span className="text-xs text-ink/65">Without it, you are still counted, but your name is not shown.</span>
            </div>
          </div>
        )}

        {!shown && roomCard && (
          <ReminderBanner startsAt={roomCard.starts_at} serverNow={roomCard.now} minutes={roomCard.rules?.reminder_minutes ?? 5} href="/recruitment/interview" />
        )}
        {!shown && !roomCard && booking?.status === "booked" && booking.mode === "online_meet" && !inRoom && (
          <ReminderBanner startsAt={booking.starts_at} room={false} />
        )}

        {roomCard && !shown && (
          <CutCard className="h-auto border-accent">
            <p className="text-sm text-ink/65">Interview room</p>
            <p className="mt-2 font-medium text-ink">
              Your interview takes place on the FusionX@SCRIET website (in-website interview room), not on Google Meet
            </p>
            <p className="mt-2 text-sm text-ink/75">
              {dayLabel(roomCard.day)}, {slotRange(roomCard.starts_at, roomCard.ends_at)} IST.
            </p>
            <Checklist text={roomCard.rules?.checklist} className="mt-4" />
            {/* The room link only on the interview date (IST); before it, when it opens. */}
            {roomCard.state === "open" || roomCard.today !== false ? (
              <div className="mt-5">
                <LinkButton href="/recruitment/interview" size="sm">
                  Join interview room
                </LinkButton>
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-ink">
                Your interview room opens on {dayLabel(roomCard.day)} at {slotTime(roomCard.opens_at)}.
              </p>
            )}
          </CutCard>
        )}

        {active && !shown && (
          <InterviewCard
            booking={booking}
            meet={meet}
            instructions={cycle.interview_instructions || DEFAULT_INSTRUCTIONS}
            reportingNote={cycle.reporting_note ?? null}
            hasSlots={slots.length > 0}
            changeHref={application?.status === "draft" ? (state === "open" ? "/recruitment/apply" : null) : "/recruitment/slot"}
            room={inRoom}
          />
        )}

        {!shown && rows.map((row) => {
          const final = row.results_out && (row.stage === "selected" || row.stage === "waitlisted" || row.stage === "not_selected");
          return (
            <CutCard key={row.team_id} className="h-auto">
              <p className="text-sm text-ink/65">{ORDINALS[row.rank - 1] ?? row.rank} choice</p>
              <h2 className="mt-1 font-serif text-xl font-medium text-ink">{row.team_name}</h2>

              <StageTimeline label={`Progress for ${row.team_name}`} steps={timeline({ stage: row.stage, resultsOut: row.results_out })} />

              <div className="mt-6 border-t border-line pt-5 text-sm">
                {row.stage === "in_review" && <p className="text-ink">Under review. The result will appear here when results are published.</p>}
                {row.stage !== "in_review" && !final && (
                  <p className="text-ink">
                    Current stage: <span className="font-medium">{STAGE_LABELS[row.stage as Stage]}</span>
                  </p>
                )}
                {row.interview_at && (
                  <p className="mt-2 text-ink">
                    Interview: <span className="font-medium">{istDateTime(row.interview_at)}</span>
                    {row.interview_location && <span className="block break-words text-ink/75">{row.interview_location}</span>}
                  </p>
                )}
                {final && (
                  <>
                    <p className="font-serif text-lg text-ink">{STAGE_LABELS[row.stage as Stage]}</p>
                    <p className="mt-2 whitespace-pre-line leading-relaxed text-ink/75">
                      {row.final_note ||
                        (row.stage === "selected"
                          ? "You have been selected for this team."
                          : row.stage === "waitlisted"
                            ? "You are on the waitlist for this team."
                            : "Thank you for applying. You were not selected for this team this time.")}
                    </p>
                    {row.stage === "selected" && groupLinks[row.team_id] && (
                      <a
                        href={groupLinks[row.team_id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--primary mt-4 inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
                      >
                        Join the team&rsquo;s WhatsApp group
                      </a>
                    )}
                  </>
                )}
              </div>
            </CutCard>
          );
        })}

        {cycle && application?.status === "submitted" && state !== "results" && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-ink/65">Submitted {istDateTime(application.submitted_at as string)}</p>
            <ActionButton
              variant="ghost"
              danger
              action={withdrawRecruitmentApplication.bind(null, cycle.id)}
              confirm={{
                title: "Withdraw your application?",
                body: "Reviewers will no longer see it. You can apply again only while applications are open.",
                confirmLabel: "Withdraw",
              }}
            >
              Withdraw application
            </ActionButton>
          </div>
        )}
      </div>
    </Section>
  );
}
