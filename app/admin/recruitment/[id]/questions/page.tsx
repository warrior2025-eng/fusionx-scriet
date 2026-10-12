import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { deleteQuestion, moveQuestion, saveQuestion } from "@/actions/admin-recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel, Pill } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { QUESTION_TYPE_LABELS, toQuestion, type Question, type QuestionType } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Recruitment questions" };

function QuestionFields({ question, teams }: { question?: Question; teams: { id: string; name: string }[] }) {
  return (
    <>
      <TextField name="label" label="Question" defaultValue={question?.label ?? ""} maxLength={300} />
      <div className="grid gap-5 sm:grid-cols-3">
        <SelectField
          name="team_id"
          label="Asked of"
          defaultValue={question?.team_id ?? ""}
          options={[{ value: "", label: "Everyone (common)" }, ...teams.map((t) => ({ value: t.id, label: `Only: ${t.name}` }))]}
        />
        <SelectField
          name="type"
          label="Answer type"
          defaultValue={question?.type ?? "short_text"}
          options={(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))}
        />
        <TextField
          name="max_length"
          label="Longest answer (characters)"
          type="number"
          min={1}
          max={5000}
          defaultValue={question?.max_length ? String(question.max_length) : ""}
          hint="For short and long answers."
        />
      </div>
      <TextareaField
        name="options"
        label="Options"
        rows={3}
        hint="For the two choice types: one option per line."
        defaultValue={(question?.options ?? []).join("\n")}
      />
      <TextField name="help_text" label="Help text (optional)" defaultValue={question?.help_text ?? ""} maxLength={300} />
      <CheckboxField name="required" label="Required" defaultChecked={question?.required ?? false} />
    </>
  );
}

/** How one question looks to a candidate (read-only). */
function Preview({ question }: { question: Question }) {
  const box = "w-full rounded-sm border border-ink/15 bg-surface px-3.5 py-2.5 text-sm text-ink/60";
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">
        {question.label}
        {question.required && <span className="text-red-600"> *</span>}
      </p>
      {(question.type === "short_text" || question.type === "url") && <div className={box}>{question.type === "url" ? "https://" : "Short answer"}</div>}
      {question.type === "long_text" && <div className={`${box} h-24`}>Long answer{question.max_length ? ` (up to ${question.max_length} characters)` : ""}</div>}
      {(question.type === "single_choice" || question.type === "multi_choice") && (
        <ul className="space-y-1.5 text-sm text-ink">
          {question.options.map((option) => (
            <li key={option} className="flex items-center gap-2.5">
              <span className={`h-4 w-4 border border-ink/40 ${question.type === "single_choice" ? "rounded-full" : ""}`} aria-hidden />
              {option}
            </li>
          ))}
        </ul>
      )}
      {question.type === "file" && <div className={box}>PDF upload, up to 3MB</div>}
      {question.help_text && <p className="mt-1 text-xs text-ink/60">{question.help_text}</p>}
    </div>
  );
}

export default async function CycleQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment.content", "/admin/recruitment");
  const admin = ctx.caps.includes("recruitment");
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  const [{ data: questionRows }, { data: teamRows }] = await Promise.all([
    ctx.supabase.from("recruitment_questions").select("*").eq("cycle_id", id).order("display_order").order("created_at"),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id).order("display_order"),
  ]);
  const questions = (questionRows ?? []).map((q) => toQuestion(q as Record<string, unknown>));
  const teams = (teamRows ?? []) as { id: string; name: string }[];
  const teamName = (teamId: string | null) => (teamId ? (teams.find((t) => t.id === teamId)?.name ?? "A team") : "Everyone");

  return (
    <AdminPage
      title={`Questions: ${cycle.title}`}
      description="Common questions go to every applicant. A team's own questions are asked only of people who choose that team."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: String(cycle.title), href: `/admin/recruitment/${id}` }, { label: "Questions" }]}
    >
      <CycleTabs cycleId={id} current="/questions" admin={admin} />

      <div className="space-y-4">
        {questions.length === 0 && <p className="text-sm text-ink/65">No questions yet. The form will only ask for the applicant&rsquo;s details, teams and resume.</p>}
        {questions.map((question, i) => (
          <details key={question.id} className="border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0 font-medium text-ink">{question.label}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Pill>{teamName(question.team_id)}</Pill>
                <Pill>{QUESTION_TYPE_LABELS[question.type]}</Pill>
                {question.required && <Pill tone="warn">Required</Pill>}
                <ActionButton bare title="Move up" disabled={i === 0} action={moveQuestion.bind(null, id, question.id, -1)}>
                  <ArrowUp size={15} />
                </ActionButton>
                <ActionButton bare title="Move down" disabled={i === questions.length - 1} action={moveQuestion.bind(null, id, question.id, 1)}>
                  <ArrowDown size={15} />
                </ActionButton>
              </span>
            </summary>
            <div className="border-t border-line p-5">
              <AdminForm action={saveQuestion.bind(null, id, question.id)}>
                <QuestionFields question={question} teams={teams} />
              </AdminForm>
              {admin && (
                <div className="mt-6">
                  <ActionButton
                    variant="ghost"
                    danger
                    action={deleteQuestion.bind(null, id, question.id)}
                    confirm={{ title: "Delete this question?", body: "Answers already given to it stay in the applications but are no longer shown.", confirmLabel: "Delete" }}
                  >
                    Delete question
                  </ActionButton>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      <Panel title="Add a question" className="mt-8">
        <AdminForm action={saveQuestion.bind(null, id, null)} submitLabel="Add question">
          <QuestionFields teams={teams} />
        </AdminForm>
      </Panel>

      {questions.length > 0 && (
        <Panel title="Candidate preview" description="How the questions read in the application form. Team questions appear only when that team is chosen." className="mt-8">
          <div className="max-w-xl space-y-6">
            {questions.filter((q) => q.team_id === null).map((q) => (
              <Preview key={q.id} question={q} />
            ))}
            {teams.map((team) => {
              const own = questions.filter((q) => q.team_id === team.id);
              if (own.length === 0) return null;
              return (
                <fieldset key={team.id} className="space-y-6 border-t border-line pt-6">
                  <legend className="pr-3 text-sm font-semibold text-ink">For {team.name}</legend>
                  {own.map((q) => (
                    <Preview key={q.id} question={q} />
                  ))}
                </fieldset>
              );
            })}
          </div>
        </Panel>
      )}
    </AdminPage>
  );
}
