import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteInterviewQuestion, saveInterviewQuestion } from "@/actions/admin-interview-questions";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "Admin: Interview questions" };

type BankQuestion = { id: string; team_id: string; body: string; display_order: number };

/**
 * The question bank for the FusionX Interview Room, per hub. Candidates never
 * see this list: in the room, the panel reveals one question at a time.
 */
export default async function InterviewQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment.content", `/admin/recruitment/${id}`);
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  const [{ data: teamRows }, { data: rows, error }] = await Promise.all([
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id).order("display_order").order("name"),
    ctx.supabase.from("recruitment_interview_questions").select("id, team_id, body, display_order").order("display_order").order("created_at"),
  ]);
  const teams = (teamRows ?? []) as { id: string; name: string }[];
  const questions = ((rows ?? []) as BankQuestion[]).filter((q) => teams.some((t) => t.id === q.team_id));
  const teamOptions = teams.map((t) => ({ value: t.id, label: t.name }));

  return (
    <AdminPage
      title={`Interview questions: ${cycle.title}`}
      description="Questions for the in-website interview room, per hub. Candidates never see this list; the panel reveals one question at a time, live."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: cycle.title as string, href: `/admin/recruitment/${id}` }, { label: "Interview questions" }]}
    >
      <CycleTabs cycleId={id} current="/interview-questions" admin={ctx.caps.includes("recruitment")} />
      {error ? (
        <Panel title="Not set up yet">
          <p className="text-sm text-ink/75">The interview room needs database migration 0023. Run it in the Supabase SQL editor, then reload this page.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          <Panel title="Add a question">
            <AdminForm action={saveInterviewQuestion.bind(null, id, null)} submitLabel="Add question">
              <div className="grid gap-5 sm:grid-cols-3">
                <SelectField name="team_id" label="Hub" options={[{ value: "", label: "Choose a hub" }, ...teamOptions]} />
                <TextField name="display_order" label="Order" type="number" min={0} max={999} defaultValue="0" hint="Lower numbers come first." />
              </div>
              <TextareaField name="body" label="Question" rows={3} max={1000} />
            </AdminForm>
          </Panel>

          {teams.map((team) => {
            const list = questions.filter((q) => q.team_id === team.id);
            return (
              <Panel key={team.id} title={team.name} description={`${list.length} question${list.length === 1 ? "" : "s"}`}>
                {list.length === 0 ? (
                  <p className="text-sm text-ink/70">No questions yet.</p>
                ) : (
                  <ol className="space-y-4">
                    {list.map((q, i) => (
                      <li key={q.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                        <p className="whitespace-pre-line text-sm text-ink">
                          <span className="mr-2 tabular-nums text-ink/60">{i + 1}.</span>
                          {q.body}
                        </p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-ink/70">Edit</summary>
                          <div className="mt-3">
                            <AdminForm action={saveInterviewQuestion.bind(null, id, q.id)} warnUnsaved={false}>
                              <div className="grid gap-5 sm:grid-cols-3">
                                <SelectField name="team_id" label="Hub" defaultValue={q.team_id} options={teamOptions} />
                                <TextField name="display_order" label="Order" type="number" min={0} max={999} defaultValue={String(q.display_order)} />
                              </div>
                              <TextareaField name="body" label="Question" rows={3} max={1000} defaultValue={q.body} />
                            </AdminForm>
                            <div className="mt-3">
                              <ActionButton
                                variant="ghost"
                                danger
                                action={deleteInterviewQuestion.bind(null, id, q.id)}
                                confirm={{ title: "Delete this question?", body: "It is removed from the bank, and from any slot it was shown to.", confirmLabel: "Delete" }}
                              >
                                Delete
                              </ActionButton>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
