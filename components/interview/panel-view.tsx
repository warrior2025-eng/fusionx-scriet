import { ExternalLink } from "lucide-react";
import { savePanelReview, type PanelAccess } from "@/actions/interview-panel";
import { setBookingStatus } from "@/actions/admin-slots";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, SelectField, TextareaField } from "@/components/admin/admin-form";
import { PanelRoom, type BankItem, type PanelPerson } from "@/components/interview/panel-room";
import { RUBRIC, rubricAverage, type IntegrityEvent, type SlotPerson } from "@/lib/interview/shared";
import { loadApplicationDetail } from "@/lib/recruitment/detail";
import { answerText, questionsFor } from "@/lib/recruitment/data";
import { dayLabel, slotRange } from "@/lib/recruitment/slots";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const scoreOptions = [{ value: "", label: "Not scored" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))];

/**
 * One interview slot for the panel, read with the viewer's own session:
 * interview_slot_people and row level security decide what a reviewer gets
 * (only their teams' candidates, their own scores). Admins also get the
 * question bank and the attendance buttons.
 */
export async function PanelView({ supabase, access, userId }: { supabase: Supabase; access: PanelAccess; userId: string }) {
  const slotId = access.slot_id;
  const [{ data: peopleRows }, { data: eventRows }, { data: revealRows }] = await Promise.all([
    supabase.rpc("interview_slot_people", { p_slot: slotId }),
    supabase.from("recruitment_integrity_events").select("id, booking_id, type, occurred_at, detail").eq("slot_id", slotId).order("id").limit(1000),
    supabase.from("recruitment_question_reveals").select("question_id").eq("slot_id", slotId),
  ]);
  const people = (Array.isArray(peopleRows) ? peopleRows : []) as SlotPerson[];
  const teamIds = [...new Set(people.flatMap((p) => (p.hubs ?? []).map((h) => h.team_id)))];

  // The bank for the hubs in this slot (admins reveal; RLS gives reviewers their own hubs only).
  const { data: bankRows } =
    access.role === "admin" && teamIds.length
      ? await supabase.from("recruitment_interview_questions").select("id, team_id, body, display_order").in("team_id", teamIds).order("display_order").order("created_at")
      : { data: [] };
  const hubName = Object.fromEntries(people.flatMap((p) => (p.hubs ?? []).map((h) => [h.team_id, h.name])));
  const bank: BankItem[] = ((bankRows ?? []) as { id: string; team_id: string; body: string }[]).map((q) => ({ id: q.id, hub: hubName[q.team_id] ?? "", body: q.body }));

  const details: Record<string, React.ReactNode> = {};
  for (const person of people) {
    const detail = await loadApplicationDetail(supabase, person.application_id);
    const scorable = (person.hubs ?? []).filter((h) => access.role === "admin" || (access.teams ?? []).includes(h.team_id));
    const asked = detail ? questionsFor(detail.questions, detail.application.preferences) : [];
    const links = detail ? Object.entries(detail.application.links).filter(([, v]) => /^https?:\/\//i.test(v)) : [];
    details[person.booking_id] = (
      <div className="space-y-4">
        {access.role === "admin" && (
          <div className="flex flex-wrap gap-2 border border-line bg-surface p-4">
            <span className="mr-2 self-center text-sm font-medium text-ink">Attendance</span>
            <ActionButton action={setBookingStatus.bind(null, access.cycle_id, person.booking_id, "attended")}>Attended</ActionButton>
            <ActionButton variant="ghost" action={setBookingStatus.bind(null, access.cycle_id, person.booking_id, "no_show")}>
              No-show
            </ActionButton>
          </div>
        )}

        {scorable.map((hub) => {
          const mine = detail?.reviews.find((r) => r.team_id === hub.team_id && r.reviewer_id === userId);
          const avg = mine ? rubricAverage(mine) : null;
          return (
            <div key={hub.team_id} className="border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">
                Your score: {hub.name}
                {avg !== null && <span className="ml-2 font-normal tabular-nums text-ink/70">rubric average {avg.toFixed(1)}</span>}
              </h3>
              <AdminForm action={savePanelReview.bind(null, slotId, person.application_id, hub.team_id)} submitLabel="Save score" warnUnsaved={false} className="mt-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  {RUBRIC.map((r) => (
                    <SelectField key={r.key} name={r.key} label={r.label} defaultValue={mine?.[r.key] ? String(mine[r.key]) : ""} options={scoreOptions} />
                  ))}
                </div>
                <SelectField name="score" label="Overall score (1–5)" defaultValue={mine?.score ? String(mine.score) : ""} options={scoreOptions} />
                <TextareaField name="private_notes" label="Private notes" rows={3} max={2000} defaultValue={mine?.private_notes ?? ""} />
              </AdminForm>
            </div>
          );
        })}

        <details className="border border-line bg-surface p-5" open>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Application</summary>
          {detail ? (
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-ink/65">Hub choices</dt>
                <dd className="text-ink">{(person.hubs ?? []).map((h) => `${h.rank}. ${h.name}`).join("  ·  ")}</dd>
              </div>
              <div>
                <dt className="text-ink/65">Department and year</dt>
                <dd className="text-ink">{[detail.application.department, detail.application.year].filter(Boolean).join(", ") || "Not given"}</dd>
              </div>
              {links.length > 0 && (
                <div>
                  <dt className="text-ink/65">Links</dt>
                  <dd className="flex flex-wrap gap-x-4 gap-y-1">
                    {links.map(([k, v]) => (
                      <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
                        {k} <ExternalLink size={12} aria-hidden />
                      </a>
                    ))}
                  </dd>
                </div>
              )}
              {asked
                .filter((q) => q.type !== "file")
                .map((q) => (
                  <div key={q.id}>
                    <dt className="text-ink/65">{q.label}</dt>
                    <dd className="whitespace-pre-line text-ink">{answerText(detail.application.answers[q.id]) || "No answer"}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink/70">Not available.</p>
          )}
        </details>
      </div>
    );
  }

  const panelPeople: PanelPerson[] = people.map((p) => ({
    booking_id: p.booking_id,
    name: p.name,
    status: p.status,
    hubs: (p.hubs ?? []).map((h) => h.name).join(", "),
    consented_at: p.consented_at,
  }));

  return (
    <>
      <p className="mb-4 text-sm text-ink/75">
        {dayLabel(access.day)} · {slotRange(access.starts_at, access.ends_at)} IST ·{" "}
        {access.room_enabled ? "In-website room" : "Google Meet day"} · phone camera {access.phone_camera} · fullscreen {access.strict_fullscreen ? "strict" : "off"}
      </p>
      <PanelRoom
        slotId={slotId}
        role={access.role}
        people={panelPeople}
        details={details}
        initialEvents={(eventRows ?? []) as IntegrityEvent[]}
        bank={bank}
        initialRevealed={(revealRows ?? []).map((r) => r.question_id as string)}
        phoneSetting={access.phone_camera}
        roomEnabled={access.room_enabled}
      />
    </>
  );
}
