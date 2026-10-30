import { ExportButtons } from "@/components/admin/export-buttons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Download, Eye } from "lucide-react";
import {
  cancelSchedule,
  lockDecisions,
  markRest,
  moveWaitlist,
  promote,
  publishNow,
  removeFromWaitlist,
  saveDecisions,
  saveHubTask,
  saveInduction,
  saveOnboarding,
  saveResultSettings,
  saveResultsDate,
  scheduleResults,
  setTaskReviewed,
  unlockDecisions,
} from "@/actions/admin-results";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { SelectAll } from "@/components/admin/select-all";
import { AdminPage, EmptyRow, Panel, Pill, Table, Td, Th, Toolbar, formatDate, param, type ListParams } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { istDateTime, toIstInput } from "@/lib/events/format";
import type { Cycle } from "@/lib/recruitment/data";
import {
  ATTENDANCE_LABELS,
  DECISION_LABELS,
  DEFAULT_RESULTS_INPUT,
  OFFER_LABELS,
  PHASES,
  REASON_LABELS,
  fillTemplate,
  phaseOf,
  resultsVisible,
  type Attendance,
} from "@/lib/recruitment/results";
import { isFinal, loadBoard, loadConfig, loadReadiness, type BoardRow } from "@/lib/recruitment/results-admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin: Recruitment results" };

const decisionOf = (row: BoardRow) => (isFinal(row.stage) ? (row.stage as "selected" | "waitlisted" | "not_selected") : "undecided");
const TONE = { undecided: "neutral", selected: "good", waitlisted: "warn", not_selected: "bad" } as const;
const ATTEND_TONE: Record<Attendance, "good" | "bad" | "neutral" | "warn"> = { attended: "good", no_show: "bad", booked: "warn", none: "neutral" };

export default async function CycleResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ListParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const { data: cycleRow } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!cycleRow) notFound();
  const cycle = cycleRow as Cycle;

  const [{ teams, rows }, readiness, config, { data: templateRows }] = await Promise.all([
    loadBoard(ctx.supabase, id),
    loadReadiness(ctx.supabase, id),
    loadConfig(ctx.supabase, id),
    ctx.supabase.from("recruitment_message_templates").select("key, body").eq("key", "social_post").maybeSingle(),
  ]);
  if (!readiness) {
    return (
      <AdminPage title={`Results: ${cycle.title}`} crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: cycle.title, href: `/admin/recruitment/${id}` }, { label: "Results" }]}>
        <CycleTabs cycleId={id} current="/results" admin />
        <Panel title="Not set up yet">
          <p className="text-sm text-ink/75">The results system needs database migration 0017. Run it in the Supabase SQL editor, then reload this page.</p>
        </Panel>
      </AdminPage>
    );
  }

  const visible = resultsVisible(cycle);
  const locked = cycle.decisions_locked === true;
  const scheduled = cycle.results_scheduled === true;
  const editable = !locked && !visible;
  const phase = phaseOf(cycle, rows.some((r) => isFinal(r.stage)));
  const base = `/admin/recruitment/${id}/results`;

  const hub = teams.find((t) => t.id === param(query, "hub")) ?? teams[0] ?? null;
  // The hub's post-result task and who has done it (migration 0021; null before it is run).
  const [{ data: hubTask, error: taskError }, { data: taskRows }] = hub
    ? await Promise.all([
        ctx.supabase.from("recruitment_hub_tasks").select("*").eq("team_id", hub.id).maybeSingle(),
        ctx.supabase.from("recruitment_task_submissions").select("application_id, status, link, submitted_at, reviewed_at").eq("team_id", hub.id),
      ])
    : [{ data: null, error: null }, { data: null }];
  const taskOf = new Map(
    ((taskRows ?? []) as { application_id: string; status: "not_started" | "submitted" | "reviewed"; link: string | null; submitted_at: string | null; reviewed_at: string | null }[]).map((t) => [t.application_id, t]),
  );
  const hubRows = hub ? rows.filter((r) => r.team_id === hub.id) : [];
  const fDecision = param(query, "decision");
  const fAttendance = param(query, "attendance");
  const fScore = Number(param(query, "score")) || 0;
  const shownRows = hubRows.filter(
    (r) =>
      (!fDecision || decisionOf(r) === fDecision) &&
      (!fAttendance || r.attendance === fAttendance) &&
      (!fScore || (r.average !== null && r.average >= fScore)),
  );
  const waitlist = hubRows.filter((r) => r.stage === "waitlisted").sort((a, b) => (a.waitlist_rank ?? 999) - (b.waitlist_rank ?? 999));
  const selected = hubRows.filter((r) => r.stage === "selected");
  const undecidedHere = hubRows.filter((r) => !isFinal(r.stage)).length;
  const counts = (teamId: string) => {
    const of = rows.filter((r) => r.team_id === teamId);
    return { selected: of.filter((r) => r.stage === "selected").length, undecided: of.filter((r) => !isFinal(r.stage)).length };
  };
  const scheduleInput = toIstInput(cycle.results_publish_at) || DEFAULT_RESULTS_INPUT;
  const socialDraft = (body: string) =>
    hub
      ? fillTemplate(body, {
          cycle: cycle.title,
          hub: hub.name,
          selected: selected.filter((r) => r.consent).map((r) => r.name).sort().join("\n") || "(none)",
          waitlist: waitlist.filter((r) => r.consent).map((r) => `${r.waitlist_rank}. ${r.name}`).join("\n") || "(none)",
        })
      : "";

  return (
    <AdminPage
      title={`Results: ${cycle.title}`}
      description="All times are India Standard Time. Decisions stay private until the publish time; the database enforces it."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: cycle.title, href: `/admin/recruitment/${id}` }, { label: "Results" }]}
    >
      <CycleTabs cycleId={id} current="/results" admin />

      <div className="space-y-6">
        {/* ── where things stand ── */}
        <Panel title="Where things stand">
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Results timeline">
            {PHASES.map((p, i) => {
              const at = PHASES.findIndex((x) => x.key === phase);
              return (
                <li
                  key={p.key}
                  aria-current={p.key === phase ? "step" : undefined}
                  className={cn(
                    "border px-3 py-2 text-xs",
                    p.key === phase ? "border-accent bg-accent text-white" : i < at ? "border-accent/40 text-ink" : "border-line text-ink/55",
                  )}
                >
                  <span className="tabular-nums">{i + 1}.</span> {p.label}
                </li>
              );
            })}
          </ol>
          <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["Undecided", readiness.undecided, readiness.undecided > 0 ? `${readiness.undecided_attended} attended the interview` : "All decided"],
                ["In two hubs", readiness.conflicts, readiness.conflicts > 0 ? readiness.conflict_names.join(", ") : "None"],
                ["Decisions", locked ? "Locked" : "Open", locked ? "Reviewers cannot change them" : "Reviewers can still change them"],
                ["Publish time", cycle.results_publish_at ? istDateTime(cycle.results_publish_at) : "Not set", visible ? "Published" : scheduled ? "Scheduled" : "Not scheduled"],
              ] as const
            ).map(([label, value, hint]) => (
              <div key={label} className="flex flex-col-reverse border border-line p-4">
                <dt className="mt-1 text-xs text-ink/65">
                  {label}
                  <span className="block text-ink/50">{hint}</span>
                </dt>
                <dd className="font-serif text-xl tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {(readiness.undecided > 0 || readiness.conflicts > 0) && !visible && (
            <p className="mt-4 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink">
              Publishing is blocked until every candidate has a decision and nobody is selected in two hubs.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton href={`${base}/public-preview`} variant="secondary" size="sm">
              <Eye size={14} aria-hidden /> Preview public results page
            </LinkButton>
            <ExportButtons href={`${base}/export`} label="Final results, all hubs" />
          </div>
        </Panel>

        {/* ── lock and schedule ── */}
        <Panel
          title="Lock and schedule"
          description={
            visible
              ? `Results are out${cycle.results_published_at ? ` since ${istDateTime(cycle.results_published_at)}` : ""}. They cannot be taken back.`
              : "1. Lock decisions. 2. Schedule the time. At that time the results appear by themselves: no button, no redeploy."
          }
        >
          {!visible && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                {!locked ? (
                  <ActionButton
                    variant="primary"
                    action={lockDecisions.bind(null, id)}
                    confirm={{
                      title: "Lock all decisions?",
                      body: "Reviewers can no longer change any decision. Absent candidates are set to not selected. Only an admin can unlock, with a reason.",
                      confirmLabel: "Lock decisions",
                    }}
                  >
                    Lock decisions
                  </ActionButton>
                ) : (
                  <Pill tone="good">Decisions locked</Pill>
                )}
                {locked && !scheduled && (
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm text-ink/75 underline underline-offset-2">Unlock decisions</summary>
                    <div className="mt-3 max-w-lg">
                      <AdminForm action={unlockDecisions.bind(null, id)} submitLabel="Unlock" warnUnsaved={false}>
                        <TextField name="reason" label="Reason (kept in the audit log)" maxLength={500} />
                      </AdminForm>
                    </div>
                  </details>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {!locked ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Results date</h3>
                    <p className="mb-3 text-xs text-ink/65">Shown to candidates now (&ldquo;Results will be announced on&hellip;&rdquo;). Scheduling comes after locking.</p>
                    <AdminForm action={saveResultsDate.bind(null, id)} submitLabel="Save date" warnUnsaved={false}>
                      <TextField name="results_at" label="Results date and time (IST)" type="datetime-local" defaultValue={scheduleInput} />
                    </AdminForm>
                  </div>
                ) : (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">{scheduled ? "Reschedule" : "Schedule results"}</h3>
                    <p className="mb-3 text-xs text-ink/65">
                      {scheduled
                        ? `Scheduled for ${istDateTime(cycle.results_publish_at)}. You can move it or cancel it until then.`
                        : "Needs: decisions locked, nobody undecided, nobody selected in two hubs."}
                    </p>
                    <AdminForm action={scheduleResults.bind(null, id)} submitLabel={scheduled ? "Reschedule" : "Schedule results"} warnUnsaved={false}>
                      <TextField name="results_at" label="Publish at (IST)" type="datetime-local" defaultValue={scheduleInput} />
                    </AdminForm>
                    {scheduled && (
                      <div className="mt-3">
                        <ActionButton
                          variant="ghost"
                          danger
                          action={cancelSchedule.bind(null, id)}
                          confirm={{ title: "Cancel the schedule?", body: "Nothing will be published until you schedule again.", confirmLabel: "Cancel schedule" }}
                        >
                          Cancel schedule
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )}
                {locked && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Publish now</h3>
                    <p className="mb-3 text-xs text-ink/65">Publishes at once, before the scheduled time. Every applicant is notified.</p>
                    <ActionButton
                      action={publishNow.bind(null, id)}
                      confirm={{
                        title: "Publish the results now?",
                        body: "Candidates see their results and the public lists appear straight away. This cannot be undone.",
                        confirmLabel: "Publish now",
                        typed: "PUBLISH",
                      }}
                    >
                      Publish now
                    </ActionButton>
                  </div>
                )}
              </div>
              <p className="text-xs leading-relaxed text-ink/60">
                At the publish time: candidates see their result on the status page, the public page shows the Selected and Waitlist names, the home page banner and the
                header &ldquo;Results&rdquo; badge appear, and every applicant gets a notification (and an email when email is switched on). The database checks the
                time itself, so this happens even if the scheduled job runs late.
              </p>
            </div>
          )}
        </Panel>

        {/* ── settings ── */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Result settings">
            <AdminForm action={saveResultSettings.bind(null, id)}>
              <SelectField
                name="one_hub_mode"
                label="When someone is selected in one hub, their other hub"
                defaultValue={cycle.one_hub_mode ?? "not_selected"}
                options={[
                  { value: "not_selected", label: "becomes Not selected (default)" },
                  { value: "keep_waitlisted", label: "keeps a waitlist place, if it has one" },
                ]}
              />
              <CheckboxField name="show_selected_publicly" label="Show selected names publicly" defaultChecked={cycle.show_selected_publicly !== false} />
              <CheckboxField name="show_waitlist_publicly" label="Show waitlist names publicly" defaultChecked={cycle.show_waitlist_publicly !== false} />
              <CheckboxField
                name="results_banner_on"
                label="Home page banner and header “Results” badge"
                hint="They appear by themselves at the publish time."
                defaultChecked={cycle.results_banner_on !== false}
              />
              <TextField name="results_banner_text" label="Banner text" maxLength={200} defaultValue={cycle.results_banner_text ?? ""} />
            </AdminForm>
          </Panel>
          <Panel title="Induction and offers" description="Only selected candidates see the induction details, after the results.">
            <AdminForm action={saveInduction.bind(null, id)}>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField name="induction_at" label="Induction date and time (IST)" type="datetime-local" defaultValue={toIstInput(config.induction_at)} />
                <SelectField
                  name="induction_mode"
                  label="Mode"
                  defaultValue={config.induction_mode ?? ""}
                  options={[
                    { value: "", label: "Not decided" },
                    { value: "online", label: "Online" },
                    { value: "in_person", label: "In person" },
                  ]}
                />
              </div>
              <TextField name="induction_link" label="Meeting link (optional)" type="url" placeholder="https://" defaultValue={config.induction_link ?? ""} />
              <TextField name="induction_venue" label="Venue (in person)" maxLength={300} defaultValue={config.induction_venue ?? ""} />
              <TextareaField name="induction_note" label="Note (optional)" rows={2} max={1000} defaultValue={config.induction_note ?? ""} />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField name="offer_days" label="Days to accept or decline" type="number" min={1} max={30} defaultValue={String(config.offer_days)} />
                <CheckboxField name="auto_expire" label="Release unanswered offers after the deadline" defaultChecked={config.auto_expire} className="sm:pt-7" />
              </div>
            </AdminForm>
          </Panel>
        </div>

        {/* ── hubs ── */}
        {teams.length === 0 ? (
          <Panel title="No hubs">
            <p className="text-sm text-ink/70">Add hubs to this cycle first.</p>
          </Panel>
        ) : (
          hub && (
            <>
              <nav aria-label="Hubs" className="flex flex-wrap gap-2">
                {teams.map((t) => {
                  const c = counts(t.id);
                  return (
                    <Link
                      key={t.id}
                      href={`${base}?hub=${t.id}`}
                      aria-current={t.id === hub.id ? "page" : undefined}
                      className={cn("border px-3 py-1.5 text-sm", t.id === hub.id ? "border-accent bg-accent text-white" : "border-line text-ink hover:border-ink/50")}
                    >
                      {t.name}
                      <span className={cn("ml-2 tabular-nums", t.id === hub.id ? "text-white/85" : "text-ink/60")}>
                        {c.selected}/{t.seats ?? "?"}
                      </span>
                      {c.undecided > 0 && <span className="ml-1.5 bg-amber-500 px-1.5 text-[11px] font-semibold text-black">{c.undecided}</span>}
                    </Link>
                  );
                })}
              </nav>

              <Panel
                title={`Decisions: ${hub.name}`}
                description={
                  <>
                    Seats: <span className="font-medium text-ink">{selected.length}</span> selected of {hub.seats ?? "no limit set"}
                    {hub.seats !== null && selected.length > hub.seats && <span className="ml-2 font-medium text-red-600">over by {selected.length - hub.seats}</span>}
                    {" · "}
                    {undecidedHere} undecided{!editable && " · read-only (decisions are locked)"}
                  </>
                }
              >
                <Toolbar
                  base={`${base}?hub=${hub.id}`}
                  params={query}
                  searchPlaceholder={null}
                  filters={[
                    { name: "decision", label: "Decision", options: Object.entries(DECISION_LABELS).map(([value, label]) => ({ value, label })) },
                    { name: "attendance", label: "Attendance", options: Object.entries(ATTENDANCE_LABELS).map(([value, label]) => ({ value, label })) },
                    { name: "score", label: "Average score at least", options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })) },
                  ]}
                >
                  <input type="hidden" name="hub" value={hub.id} />
                </Toolbar>

                <DecisionTable rows={shownRows} editable={editable} cycleId={id} teamId={hub.id} />

                {editable && undecidedHere > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ActionButton
                      variant="ghost"
                      action={markRest.bind(null, id, hub.id, "not_selected")}
                      confirm={{ title: `Mark ${undecidedHere} undecided in ${hub.name} as Not selected?`, confirmLabel: "Mark them" }}
                    >
                      Mark the rest of {hub.name} as Not selected
                    </ActionButton>
                    {readiness.undecided > undecidedHere && (
                      <ActionButton
                        variant="ghost"
                        action={markRest.bind(null, id, null, "not_selected")}
                        confirm={{ title: `Mark all ${readiness.undecided} undecided (every hub) as Not selected?`, confirmLabel: "Mark them" }}
                      >
                        Mark the rest in every hub
                      </ActionButton>
                    )}
                  </div>
                )}
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel
                  title={`Waitlist: ${hub.name}`}
                  description={visible ? "Promote the next person when a seat frees up. The ranks below move up and the public lists update." : "In rank order. Reorder before locking."}
                >
                  {waitlist.length === 0 ? (
                    <p className="text-sm text-ink/65">No one is waitlisted for this hub.</p>
                  ) : (
                    <ol className="divide-y divide-line border-y border-line">
                      {waitlist.map((r, i) => (
                        <li key={r.application_id} className="flex flex-wrap items-center gap-3 py-2.5">
                          <span className="w-8 tabular-nums text-ink/60">#{r.waitlist_rank}</span>
                          <span className="min-w-0 flex-1 text-sm text-ink">
                            {r.name}
                            {!r.consent && <span className="ml-2 text-xs text-ink/55">(name not public)</span>}
                          </span>
                          {editable && (
                            <span className="flex gap-1">
                              <ActionButton bare title={`Move ${r.name} up`} disabled={i === 0} action={moveWaitlist.bind(null, id, r.application_id, hub.id, -1)}>
                                <ArrowUp size={15} />
                              </ActionButton>
                              <ActionButton bare title={`Move ${r.name} down`} disabled={i === waitlist.length - 1} action={moveWaitlist.bind(null, id, r.application_id, hub.id, 1)}>
                                <ArrowDown size={15} />
                              </ActionButton>
                            </span>
                          )}
                          {visible && (
                            <span className="flex flex-wrap items-center gap-2">
                              <ActionButton
                                variant={i === 0 ? "primary" : "secondary"}
                                action={promote.bind(null, id, r.application_id, hub.id)}
                                confirm={{
                                  title: `Promote ${r.name} (#${r.waitlist_rank}) to Selected?`,
                                  body: `They get a notification, the WhatsApp link and an offer to accept. Everyone below moves up one place.`,
                                  confirmLabel: "Promote",
                                }}
                              >
                                Promote
                              </ActionButton>
                              <details>
                                <summary className="cursor-pointer text-xs text-ink/65 underline underline-offset-2">Remove</summary>
                                <div className="mt-2 w-64">
                                  <AdminForm action={removeFromWaitlist.bind(null, id, r.application_id, hub.id)} submitLabel="Remove" warnUnsaved={false}>
                                    <TextField name="reason" label="Reason" maxLength={300} />
                                  </AdminForm>
                                </div>
                              </details>
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>

                <Panel title={`Social media: ${hub.name}`} description="A draft to copy. Consenting names only. Nothing is posted automatically.">
                  <label className="block">
                    <span className="sr-only">Announcement draft</span>
                    <textarea readOnly rows={9} className="w-full border border-line bg-paper p-3 font-mono text-xs text-ink" defaultValue={socialDraft((templateRows?.body as string | undefined) ?? "")} />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <ExportButtons href={`${base}/social?hub=${hub.id}`} label={hub.name} />
                    <ExportButtons href={`${base}/social`} label="Every hub" variant="ghost" />
                    <Link href="/admin/recruitment/templates" className="self-center text-sm text-ink/70 underline underline-offset-2">
                      Edit the template
                    </Link>
                  </div>
                </Panel>
              </div>

              {visible && (
                <Panel title={`Selected: ${hub.name}`} description="Offers, the WhatsApp group and the induction.">
                  <Table label={`Selected candidates in ${hub.name}`}>
                    <thead>
                      <tr>
                        <Th>Candidate</Th>
                        <Th>Offer</Th>
                        <Th>Checklist</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.length === 0 && <EmptyRow colSpan={3}>No one is selected in this hub.</EmptyRow>}
                      {selected.map((r) => (
                        <tr key={r.application_id}>
                          <Td className="font-medium text-ink">
                            {r.name}
                            {r.promoted_at && <span className="block text-xs font-normal text-ink/60">Promoted {formatDate(r.promoted_at, true)}</span>}
                          </Td>
                          <Td>{r.offer_status ? <Pill tone={r.offer_status === "accepted" ? "good" : "warn"}>{OFFER_LABELS[r.offer_status]}</Pill> : "Not sent"}</Td>
                          <Td>
                            <details>
                              <summary className="cursor-pointer text-sm">
                                {r.whatsapp_added ? "WhatsApp ✓" : "WhatsApp –"} · {r.induction_attended ? "Induction ✓" : "Induction –"}
                              </summary>
                              <div className="mt-3 w-72">
                                <AdminForm action={saveOnboarding.bind(null, id, r.application_id, hub.id)} warnUnsaved={false}>
                                  <CheckboxField name="whatsapp_added" label="Added to the WhatsApp group" defaultChecked={r.whatsapp_added} />
                                  <CheckboxField name="induction_attended" label="Attended the induction" defaultChecked={r.induction_attended} />
                                  <TextareaField name="onboarding_notes" label="Notes" rows={2} max={1000} defaultValue={r.onboarding_notes ?? ""} />
                                </AdminForm>
                              </div>
                            </details>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}

              <Panel
                title={`Post-result task: ${hub.name}`}
                description="One task for the candidates selected into this hub. They see it on their status page, and are notified, only after the results are out."
              >
                {taskError ? (
                  <p className="text-sm text-ink/75">Post-result tasks need database migration 0021. Run it in the Supabase SQL editor, then reload this page.</p>
                ) : (
                  <>
                    <AdminForm action={saveHubTask.bind(null, id, hub.id)} submitLabel="Save task" key={hub.id}>
                      <TextField name="task_title" label="Title" required maxLength={200} defaultValue={hubTask?.title ?? ""} />
                      <TextareaField name="task_description" label="Description" rows={4} max={4000} defaultValue={hubTask?.description ?? ""} />
                      <div className="grid gap-5 sm:grid-cols-2">
                        <TextField name="task_deadline" label="Deadline (IST)" type="datetime-local" defaultValue={toIstInput(hubTask?.deadline ?? null)} />
                        <TextField name="task_link" label="Submission link (optional)" type="url" placeholder="https://forms.gle/..." defaultValue={hubTask?.link ?? ""} hint="A Google Form, Drive folder or similar." />
                      </div>
                      <CheckboxField
                        name="task_published"
                        label="Published (selected candidates see it after the results)"
                        defaultChecked={hubTask?.is_published ?? false}
                      />
                    </AdminForm>

                    <h3 className="mb-3 mt-8 text-sm font-semibold text-ink">Selected candidates</h3>
                    <Table label={`Task status in ${hub.name}`}>
                      <thead>
                        <tr>
                          <Th>Candidate</Th>
                          <Th>Task</Th>
                          <Th>Link</Th>
                          <Th>
                            <span className="sr-only">Review</span>
                          </Th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.length === 0 && <EmptyRow colSpan={4}>No one is selected in this hub{visible ? "." : " yet."}</EmptyRow>}
                        {selected.map((r) => {
                          const t = taskOf.get(r.application_id);
                          const status = t?.status ?? "not_started";
                          return (
                            <tr key={r.application_id}>
                              <Td className="font-medium text-ink">{r.name}</Td>
                              <Td>
                                <Pill tone={status === "reviewed" ? "good" : status === "submitted" ? "warn" : "neutral"}>
                                  {status === "reviewed" ? "Reviewed" : status === "submitted" ? "Submitted" : "Not started"}
                                </Pill>
                                {t?.submitted_at && <span className="block text-xs text-ink/60">{istDateTime(t.submitted_at)}</span>}
                              </Td>
                              <Td className="max-w-56 break-all">
                                {t?.link ? (
                                  <a href={t.link} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                                    {t.link}
                                  </a>
                                ) : (
                                  <span className="text-ink/50">None</span>
                                )}
                              </Td>
                              <Td>
                                {status !== "not_started" && (
                                  <ActionButton action={setTaskReviewed.bind(null, id, hub.id, r.application_id, status !== "reviewed")}>
                                    {status === "reviewed" ? "Mark not reviewed" : "Mark reviewed"}
                                  </ActionButton>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </>
                )}
              </Panel>
            </>
          )
        )}
      </div>
    </AdminPage>
  );
}

/** The board for one hub. Editable as one form while decisions are open; read-only after locking. */
function DecisionTable({ rows, editable, cycleId, teamId }: { rows: BoardRow[]; editable: boolean; cycleId: string; teamId: string }) {
  const table = (
    <Table label="Final decisions">
      <thead>
        <tr>
          {editable && (
            <Th className="w-10">
              <SelectAll name="ids" label="Select all rows shown" />
            </Th>
          )}
          <Th>Candidate</Th>
          <Th>Choice</Th>
          <Th>Interview</Th>
          <Th>Average</Th>
          <Th>Reviewer notes</Th>
          <Th>Decision</Th>
          <Th>Waitlist</Th>
          <Th>Message to the candidate (optional)</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow colSpan={editable ? 9 : 8}>No candidates match.</EmptyRow>}
        {rows.map((r) => {
          const d = decisionOf(r);
          return (
            <tr key={r.application_id}>
              {editable && (
                <Td>
                  <input type="hidden" name="row" value={r.application_id} />
                  <input type="checkbox" name="ids" value={r.application_id} aria-label={`Select ${r.name}`} className="h-4 w-4 accent-accent" />
                </Td>
              )}
              <Td className="min-w-[10rem]">
                <span className="font-medium text-ink">{r.name}</span>
                <span className="block text-xs text-ink/60">{[r.department, r.year].filter(Boolean).join(", ")}</span>
                <Link href={`/admin/recruitment/${cycleId}/results/preview?app=${r.application_id}`} className="text-xs text-accent underline underline-offset-2">
                  Preview as candidate
                </Link>
              </Td>
              <Td className="tabular-nums">{r.pref_rank}</Td>
              <Td>
                <Pill tone={ATTEND_TONE[r.attendance]}>{ATTENDANCE_LABELS[r.attendance]}</Pill>
              </Td>
              <Td className="tabular-nums">{r.average !== null ? r.average.toFixed(1) : ""}</Td>
              <Td className="min-w-[9rem]">
                {r.reviews.length === 0 ? (
                  <span className="text-xs text-ink/50">None</span>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-xs text-ink/75">
                      {r.reviews.length} review{r.reviews.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 max-w-xs space-y-2 text-xs">
                      {r.reviews.map((rv, i) => (
                        <li key={i}>
                          <span className="font-medium text-ink">{rv.reviewer}</span>
                          {rv.score !== null && <span className="ml-1 text-accent">{rv.score}/5</span>}
                          {rv.notes && <span className="block whitespace-pre-line text-ink/70">{rv.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Td>
              <Td className="min-w-[10rem]">
                {editable ? (
                  <>
                    <input type="hidden" name={`orig_${r.application_id}`} value={d} />
                    <select
                      name={`dec_${r.application_id}`}
                      defaultValue={d}
                      aria-label={`Decision for ${r.name}`}
                      className="w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                    >
                      {Object.entries(DECISION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {r.attendance === "no_show" && (
                      <input
                        name={`why_${r.application_id}`}
                        placeholder="Reason to override absent"
                        aria-label={`Reason to override the absent rule for ${r.name}`}
                        maxLength={300}
                        className="mt-1.5 w-full border border-line bg-paper px-2 py-1 text-xs text-ink"
                      />
                    )}
                  </>
                ) : (
                  <Pill tone={TONE[d]}>{DECISION_LABELS[d]}</Pill>
                )}
                {r.reason && <span className="mt-1 block text-xs text-ink/60">{REASON_LABELS[r.reason]}</span>}
                {r.offer_status && <span className="mt-1 block text-xs text-ink/60">Offer: {OFFER_LABELS[r.offer_status]}</span>}
              </Td>
              <Td className="tabular-nums">{r.waitlist_rank ? `#${r.waitlist_rank}` : ""}</Td>
              <Td className="min-w-[12rem]">
                {editable ? (
                  <>
                    <input type="hidden" name={`origmsg_${r.application_id}`} value={r.final_note ?? ""} />
                    <input
                      name={`msg_${r.application_id}`}
                      defaultValue={r.final_note ?? ""}
                      maxLength={1000}
                      aria-label={`Message to ${r.name}`}
                      placeholder="Uses the template when empty"
                      className="w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                    />
                  </>
                ) : (
                  <span className="text-xs text-ink/70">{r.final_note}</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
  if (!editable) return table;
  return (
    <AdminForm action={saveDecisions.bind(null, cycleId, teamId)} submitLabel="Save decisions">
      {table}
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          name="bulk_decision"
          label="Set the ticked rows to"
          defaultValue=""
          options={[{ value: "", label: "Keep each row's own choice" }, ...Object.entries(DECISION_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </div>
      <p className="text-xs text-ink/60">
        Selecting someone here sets their other hub to Not selected (see Result settings). An absent candidate stays Not selected unless you give a reason.
      </p>
    </AdminForm>
  );
}
