import { ExternalLink, FileText } from "lucide-react";
import { saveReview, setApplicationStage } from "@/actions/review";
import { AdminForm, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { Panel, Pill, formatDate } from "@/components/admin/ui";
import { toIstInput } from "@/lib/events/format";
import {
  STAGES,
  STAGE_LABELS,
  STAGE_TONE,
  answerText,
  questionsFor,
  type Application,
  type Question,
  type Stage,
} from "@/lib/recruitment/data";
import type { createClient } from "@/lib/supabase/server";
import { RUBRIC, rubricAverage, type RubricScores } from "@/lib/interview/shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TeamStatusRow = {
  team_id: string;
  rank: number;
  stage: Stage;
  stage_updated_at: string;
  interview_at: string | null;
  interview_location: string | null;
  final_note: string | null;
};
export type ReviewRow = { team_id: string; reviewer_id: string; score: number | null; private_notes: string | null; updated_at: string } & RubricScores;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/**
 * One application as a reviewer or admin sees it: who applied, their answers
 * and files, and, for each team the viewer may act on, the stage and reviews.
 * Files are opened through links that expire after five minutes.
 */
export async function ApplicationView({
  supabase,
  application,
  questions,
  teamNames,
  statuses,
  reviews,
  reviewerNames,
  userId,
  locked = false,
}: {
  /** Decisions are locked (or the results are out): the stage can no longer be moved. */
  locked?: boolean;
  supabase: Supabase;
  application: Application;
  questions: Question[];
  teamNames: Record<string, string>;
  /** Stage rows for the teams this viewer may act on. */
  statuses: TeamStatusRow[];
  reviews: ReviewRow[];
  reviewerNames: Record<string, string>;
  userId: string;
}) {
  const signed = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await supabase.storage.from("recruitment-resumes").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };
  const asked = questionsFor(questions, application.preferences);
  // The interview rubric (migration 0023): shown and saved only once its columns exist.
  const { error: rubricMissing } = await supabase.from("recruitment_reviews").select("rubric_skills").limit(1);
  const rubric = !rubricMissing;
  const fileLinks = Object.fromEntries(
    await Promise.all(
      asked.filter((q) => q.type === "file").map(async (q) => [q.id, await signed(answerText(application.answers[q.id]))] as const),
    ),
  );
  const resumeUrl = await signed(application.resume_path);
  const links = Object.entries(application.links).filter(([, url]) => /^https?:\/\//i.test(url));

  const row = (label: React.ReactNode, value: React.ReactNode) => (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-ink/65">{label}</dt>
      <dd className="whitespace-pre-line break-words text-sm text-ink sm:col-span-2">{value || <span className="text-ink/50">Not given</span>}</dd>
    </div>
  );
  const fileLink = (url: string | null, label: string) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent">
        <FileText size={15} aria-hidden /> {label}
      </a>
    ) : null;

  return (
    <div className="space-y-6">
      <Panel title={application.full_name ?? "Applicant"} description={`Submitted ${formatDate(application.submitted_at, true)}`}>
        <dl className="divide-y divide-line">
          {row("Department", application.department)}
          {row("Year", application.year)}
          {row(
            "Preferences",
            application.preferences.map((id, i) => `${ORDINALS[i] ?? `${i + 1}th`}: ${teamNames[id] ?? "Another team"}`).join("\n"),
          )}
          {row("Resume", fileLink(resumeUrl, "Open resume (PDF)"))}
          {row(
            "Links",
            links.length > 0 && (
              <span className="flex flex-col gap-1">
                {links.map(([key, url]) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 break-all text-accent">
                    <ExternalLink size={14} aria-hidden /> {url}
                  </a>
                ))}
              </span>
            ),
          )}
        </dl>
      </Panel>

      <Panel title="Answers">
        {asked.length === 0 ? (
          <p className="text-sm text-ink/65">This application had no questions.</p>
        ) : (
          <dl className="divide-y divide-line">
            {asked.map((q) =>
              row(
                <>
                  {q.label}
                  {q.team_id && <span className="block text-xs">{teamNames[q.team_id]}</span>}
                </>,
                q.type === "file" ? fileLink(fileLinks[q.id] ?? null, "Open file (PDF)") : answerText(application.answers[q.id]),
              ),
            )}
          </dl>
        )}
      </Panel>

      {statuses.map((status) => {
        const teamReviews = reviews.filter((r) => r.team_id === status.team_id);
        const mine = teamReviews.find((r) => r.reviewer_id === userId);
        const scores = teamReviews.filter((r) => r.score !== null).map((r) => r.score as number);
        const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
        const rubricScores = teamReviews.map(rubricAverage).filter((v): v is number => v !== null);
        const rubricAvg = rubricScores.length ? (rubricScores.reduce((a, b) => a + b, 0) / rubricScores.length).toFixed(1) : null;
        return (
          <Panel
            key={status.team_id}
            title={`${teamNames[status.team_id] ?? "Team"} (${ORDINALS[status.rank - 1] ?? status.rank} choice)`}
            description={
              (average ? `Average score ${average} from ${scores.length} review${scores.length === 1 ? "" : "s"}` : "No scores yet") +
              (rubricAvg ? ` · Interview rubric average ${rubricAvg}` : "")
            }
          >
            <p className="mb-5 text-sm text-ink">
              Stage: <Pill tone={STAGE_TONE[status.stage]}>{STAGE_LABELS[status.stage]}</Pill>
              <span className="ml-2 text-ink/60">since {formatDate(status.stage_updated_at, true)}</span>
            </p>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">Move stage</h3>
                {locked ? (
                  <p className="border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-ink">
                    Decisions are locked. Only an admin can unlock them.
                  </p>
                ) : (
                <AdminForm action={setApplicationStage.bind(null, application.id, status.team_id)} submitLabel="Update stage">
                  <SelectField name="stage" label="Stage" defaultValue={status.stage} options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))} />
                  <TextField
                    name="interview_at"
                    label="Interview date and time (IST)"
                    type="datetime-local"
                    defaultValue={toIstInput(status.interview_at)}
                    hint="Needed for the Interview stage."
                  />
                  <TextField name="interview_location" label="Interview place or link" defaultValue={status.interview_location ?? ""} maxLength={300} />
                  <TextareaField
                    name="final_note"
                    label="Note for the candidate"
                    hint="The candidate sees this once results are published."
                    rows={3}
                    max={1000}
                    defaultValue={status.final_note ?? ""}
                  />
                </AdminForm>
                )}
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">Your review</h3>
                <AdminForm action={saveReview.bind(null, application.id, status.team_id)} submitLabel="Save review">
                  <SelectField
                    name="score"
                    label="Score"
                    defaultValue={mine?.score ? String(mine.score) : ""}
                    options={[{ value: "", label: "No score" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]}
                  />
                  {rubric && (
                    <div className="grid gap-5 sm:grid-cols-2">
                      {RUBRIC.map((r) => (
                        <SelectField
                          key={r.key}
                          name={r.key}
                          label={`${r.label} (1–5)`}
                          defaultValue={mine?.[r.key] ? String(mine[r.key]) : ""}
                          options={[{ value: "", label: "Not scored" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]}
                        />
                      ))}
                    </div>
                  )}
                  <TextareaField
                    name="private_notes"
                    label="Private notes"
                    hint="Only this team's reviewers and admins see these."
                    rows={4}
                    max={2000}
                    defaultValue={mine?.private_notes ?? ""}
                  />
                </AdminForm>
                {teamReviews.filter((r) => r.reviewer_id !== userId).length > 0 && (
                  <ul className="mt-6 space-y-3 border-t border-line pt-5">
                    {teamReviews
                      .filter((r) => r.reviewer_id !== userId)
                      .map((r) => (
                        <li key={r.reviewer_id} className="text-sm">
                          <p className="font-medium text-ink">
                            {reviewerNames[r.reviewer_id] ?? "Reviewer"}
                            {r.score !== null && <span className="ml-2 tabular-nums text-accent">{r.score} / 5</span>}
                            {rubricAverage(r) !== null && <span className="ml-2 tabular-nums text-ink/70">rubric {rubricAverage(r)!.toFixed(1)}</span>}
                          </p>
                          {r.private_notes && <p className="mt-1 whitespace-pre-line text-ink/75">{r.private_notes}</p>}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
