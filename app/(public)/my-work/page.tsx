import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { BusyDates, CheckinForm, OfferButtons, PreferencesForm, ProofForm, PushToggle, RequestChange, ReviewForm } from "@/components/autopilot/work-parts";
import { PitchForm, PitchVote, TakeTask } from "@/components/autopilot/people-parts";
import { ShareCardButton, ShowOnImpact, SuggestOpportunity } from "@/components/autopilot/outcome-parts";
import { IdeaCard, type IdeaCardData } from "@/components/autopilot/ideas-for-you";
import { MySquadsBlock, type MySquads } from "@/components/squads/my-squads";
import { Fold } from "@/components/autopilot/fold";
import { dayLabel, daysFromToday, getAutopilotViewer, peopleById, proofHref, todayIST, type TaskRow } from "@/lib/autopilot/server";
import { EFFORT_LABEL, PROOF_LABEL, STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My work" };

/** "Tue 17 Nov, 3:00 pm" (IST), and whether that time has passed or is within a day. */
/** Milliseconds until a time (outside the component, so rendering stays pure). */
const msUntil = (at: number) => at - Date.now();

function By({ iso, label }: { iso: string; label: string }) {
  const at = Date.parse(iso);
  const left = msUntil(at);
  const text = new Date(at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <span className={cn("text-xs", left < 0 ? "font-semibold text-red-600 dark:text-red-400" : left < 864e5 ? "font-semibold text-ink" : "text-ink/60")} data-deadline>
      {left < 0 ? `${label} time passed (${text})` : `${label} ${text}`}
    </span>
  );
}
/** Ideas stay 4 weeks in "Ideas for you", then move to the archive (they can still be started from there). */
function ideaDeadline(batch: string, state: string | null, today: string): string {
  const until = new Date(new Date(`${batch}T00:00:00Z`).getTime() + 28 * 864e5).toISOString().slice(0, 10);
  if (state === "saved") return "Saved: it stays here until you start or remove it";
  return until >= today ? `Pick by ${dayLabel(until)} · then it moves to the archive` : "In the archive: you can still start it";
}
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Due({ date }: { date: string }) {
  const d = daysFromToday(date);
  const text = d === 0 ? "due today" : d === 1 ? "due tomorrow" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} late` : `due ${dayLabel(date)}`;
  return <span className={cn("text-xs", d < 0 ? "font-semibold text-red-600 dark:text-red-400" : d <= 2 ? "font-semibold text-ink" : "text-ink/60")}>{text}</span>;
}

function Block({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink/60">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink/60">{children}</p>;

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ ideas?: string }> }) {
  const { ideas: ideaFilter } = await searchParams;
  const viewer = await getAutopilotViewer();
  if (!viewer) redirect("/login?next=/my-work");
  const { supabase, user } = viewer;
  const today = todayIST();
  const d = new Date(`${today}T00:00:00Z`);
  const week = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);

  const [offers, mine, reviews, busy, checkin, prefs, subs, contributions, owned, community, pitchBoard, projectTasks, collab, settings, badges, cards, certs, savedIdeas, opps, me] = await Promise.all([
    supabase.from("task_offers").select("id, offered_at, task:mission_tasks(id, title, due_on, effort, hub, proof, mission:missions(title))").eq("user_id", user.id).eq("status", "offered").order("offered_at"),
    supabase.from("mission_tasks").select("*, mission:missions(id, title, status)").eq("assignee_id", user.id).in("status", ["accepted", "changes", "submitted"]).order("due_on"),
    supabase.from("task_reviews").select("id, kind, due_at, task:mission_tasks(id, title, proof, proof_text, proof_url, assignee_id, checklist, mission:missions(title))").eq("reviewer_id", user.id).eq("status", "pending").order("due_at"),
    supabase.from("availability").select("id, starts_on, ends_on, note").eq("user_id", user.id).gte("ends_on", today).order("starts_on"),
    supabase.from("checkins").select("done, next, blocked").eq("user_id", user.id).eq("week_start", week).maybeSingle(),
    supabase.from("work_preferences").select("delivery, push").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("user_id", user.id),
    supabase.from("contributions").select("id, title, skill, contributed_on, mission_id, mission:missions(title)").eq("user_id", user.id).eq("counts", true).order("contributed_on", { ascending: false }).limit(50),
    supabase.from("missions").select("id, title, status, mission_date").eq("owner_id", user.id).in("status", ["planned", "active", "review"]).order("mission_date"),
    // Migration 0043 (people); empty before it.
    supabase.from("mission_tasks").select("id, title, due_on, hub, effort, proof, mission:missions(title, status)").eq("community_allowed", true).eq("status", "open").is("assignee_id", null).order("due_on").limit(10),
    supabase.rpc("ap_pitch_board"),
    supabase.from("project_tasks").select("id, title, due_on, project:projects(id, title, target_date), milestone:project_milestones(title, due_on)").eq("assignee_id", user.id).is("done_at", null).is("mission_task_id", null).order("due_on", { nullsFirst: false }),
    supabase.from("collaborators").select("ends_on").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabase.from("community_settings").select("community_on").eq("id", 1).maybeSingle(),
    // Migration 0044 (outcomes); empty before it.
    supabase.from("skill_badges").select("label, count").eq("user_id", user.id).order("count", { ascending: false }),
    supabase.from("share_cards").select("code, mission_id").eq("user_id", user.id),
    supabase.from("certificate_verifications").select("code, period_label, issued_at").eq("user_id", user.id).eq("status", "issued"),
    supabase.from("idea_drafts").select("id, kind, title, pitch, level, learn, data, batch_date, published_at").not("published_at", "is", null).order("batch_date", { ascending: false }).order("level").limit(200),
    supabase.from("opportunities").select("id, title, organizer, deadline, registration_url, city, distance_km, value_score, mode").eq("is_published", true).gte("deadline", today).order("value_score", { ascending: false, nullsFirst: false }).limit(20),
    supabase.from("profiles").select("show_on_impact, skills").eq("id", user.id).maybeSingle(),
  ]);
  // Finished public missions I did verified work on: a share card each.
  const doneMissionIds = [...new Set(((contributions.data ?? []) as unknown as { mission_id?: string }[]).map((c) => c.mission_id).filter(Boolean))] as string[];
  const { data: doneMissions } = doneMissionIds.length
    ? await supabase.from("missions").select("id, title").in("id", doneMissionIds).eq("status", "done").eq("visibility", "public")
    : { data: [] };
  const cardBy = new Map(((cards.data ?? []) as { code: string; mission_id: string }[]).map((c) => [c.mission_id, c.code]));
  // "Top 5 for you": the radar's value, then the hubs and skills that fit.
  const mySkills = ((me.data?.skills as string[] | undefined) ?? []).map((x) => x.toLowerCase());
  const top5 = ((opps.data ?? []) as { id: string; title: string; organizer: string; deadline: string; registration_url: string | null; city: string | null; distance_km: number | null; value_score: number | null; mode: string | null }[])
    .map((o) => ({ ...o, fit: (o.value_score ?? 0) + mySkills.filter((k) => o.title.toLowerCase().includes(k)).length * 10 }))
    .sort((a, b) => b.fit - a.fit).slice(0, 5);
  // Ideas for you (migration 0045): every delivered idea for everyone; 4 weeks here, then the archive.
  type Raw = { id: string; kind: "project" | "research"; title: string; pitch: string; level: number | null; learn: string | null; data: Record<string, unknown>; batch_date: string | null; published_at: string };
  const rawIdeas = (savedIdeas.data ?? []) as Raw[];
  const [{ data: states }, { data: teamRows }] = rawIdeas.length
    ? await Promise.all([
        supabase.from("idea_member_states").select("idea_id, state").eq("user_id", user.id),
        supabase.rpc("ap_idea_teams", { p_ids: rawIdeas.map((i) => i.id) }),
      ])
    : [{ data: [] }, { data: [] }];
  // Squad Match (migration 0047): invites to answer and my squads.
  const { data: squadData } = await supabase.rpc("ap_squad_my");
  const mySquads = (squadData ?? { invites: [], squads: [] }) as MySquads;
  const stateBy = new Map(((states ?? []) as { idea_id: string; state: "saved" | "hidden" }[]).map((x) => [x.idea_id, x.state]));
  const teamsBy = new Map<string, { project_id: string; started_by: string; joinable: boolean }[]>();
  for (const t of (teamRows ?? []) as { idea_id: string; project_id: string; started_by: string; joinable: boolean }[]) teamsBy.set(t.idea_id, [...(teamsBy.get(t.idea_id) ?? []), t]);
  const fourWeeks = new Date(new Date(`${today}T00:00:00Z`).getTime() - 28 * 864e5).toISOString().slice(0, 10);
  const hubWords: Record<string, RegExp> = { design: /(design|figma|canva|ui|ux|video)/i, competitions: /(research|pitch|writing|marketing)/i, projects: /(program|code|web|python|data|ml|app)/i, events: /(event|host|plan|manage)/i };
  const myText = mySkills.join(" ");
  const ideaCards: (IdeaCardData & { batch: string })[] = rawIdeas.filter((i) => stateBy.get(i.id) !== "hidden").map((i) => ({
    id: i.id, kind: i.kind, title: i.title, pitch: i.pitch, level: i.level, learn: i.learn, data: i.data, state: stateBy.get(i.id) ?? null,
    teams: teamsBy.get(i.id) ?? [], hubs: (i.data.hubs as string[] | undefined) ?? [], batch: i.batch_date ?? i.published_at.slice(0, 10),
    deadlineNote: ideaDeadline(i.batch_date ?? i.published_at.slice(0, 10), stateBy.get(i.id) ?? null, today),
  }));
  const suits = (i: IdeaCardData) => !mySkills.length || i.hubs.some((h) => hubWords[h]?.test(myText)) || mySkills.some((k) => String(i.data.stack ?? "").toLowerCase().includes(k));
  const current = ideaCards.filter((i) => i.batch >= fourWeeks || i.state === "saved").filter((i) => ideaFilter !== "mine" || suits(i));
  const archive = ideaCards.filter((i) => i.batch < fourWeeks && i.state !== "saved");
  type Pitch = { id: string; title: string; summary: string; pitched_by_name: string; mine: boolean; status: string; voting_ends_at: string; options: { key: string; name: string; description: string; votes: number }[] | null; my_vote: string | null; votes: number };
  const pitches = (pitchBoard.data ?? []) as Pitch[];
  const communityTasks = ((community.data ?? []) as unknown as { id: string; title: string; due_on: string; hub: string; effort: string; proof: string; mission: { title: string; status: string } | null }[])
    .filter((t) => t.mission && ["planned", "active"].includes(t.mission.status));
  const myProjectTasks = (projectTasks.data ?? []) as unknown as { id: string; title: string; due_on: string | null; project: { id: string; title: string; target_date: string | null } | null; milestone: { title: string; due_on: string | null } | null }[];
  const communityOn = settings.data?.community_on !== false;

  type Offer = { id: string; offered_at: string; task: { id: string; title: string; due_on: string; effort: string; hub: string; proof: string; mission: { title: string } | null } | null };
  type Mine = TaskRow & { mission: { id: string; title: string; status: string } | null };
  type Review = { id: string; kind: string; due_at: string; task: { id: string; title: string; proof: string; proof_text: string | null; proof_url: string | null; assignee_id: string | null; checklist: string[]; mission: { title: string } | null } | null };
  const offerRows = (offers.data ?? []) as unknown as Offer[];
  // The answer and check-in times come from Autopilot's settings (read on the server; members cannot read them).
  const numbers = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? (((await createAdminClient().from("autopilot_settings").select("numbers").eq("id", 1).maybeSingle()).data?.numbers ?? {}) as Record<string, number>)
    : {};
  const offerHours = Number(numbers.offer_timeout_hours ?? 24);
  const checkinDay = WEEKDAY[Number(numbers.checkin_weekday ?? 5) % 7];
  const mineRows = (mine.data ?? []) as unknown as Mine[];
  const reviewRows = (reviews.data ?? []) as unknown as Review[];
  const contribRows = (contributions.data ?? []) as unknown as { id: string; title: string; skill: string | null; contributed_on: string; mission: { title: string } | null }[];
  const names = await peopleById(supabase, reviewRows.map((r) => r.task?.assignee_id));
  const proofLinks = await Promise.all(reviewRows.map((r) => proofHref(supabase, r.task?.proof_url ?? null)));
  const myMissions = new Map<string, { id: string; title: string; status: string }>();
  for (const t of mineRows) if (t.mission) myMissions.set(t.mission.id, t.mission);
  for (const m of owned.data ?? []) myMissions.set(m.id as string, { id: m.id as string, title: `${m.title} (you own it)`, status: m.status as string });
  // What needs the member now, and the nearest deadline among it (shown at the top).
  const openTasks = mineRows.filter((t) => t.status !== "submitted");
  const todo = offerRows.length + openTasks.length + reviewRows.length + myProjectTasks.length + mySquads.invites.length;
  const nextDeadline = [
    ...offerRows.map((o) => new Date(Date.parse(o.offered_at) + offerHours * 3_600_000).toISOString().slice(0, 10)),
    ...openTasks.map((t) => t.due_on),
    ...reviewRows.map((r) => (r.due_at ?? "").slice(0, 10)),
    ...myProjectTasks.map((t) => t.due_on ?? t.milestone?.due_on ?? t.project?.target_date ?? ""),
  ].filter(Boolean).sort()[0];
  const nothing = todo === 0 && mineRows.length === 0;
  const busyRows = (busy.data ?? []) as { id: string; starts_on: string; ends_on: string; note: string | null }[];
  const checkinRow = (checkin.data as { done: string | null; next: string | null; blocked: string | null } | null) ?? null;
  const votingNow = pitches.filter((p) => p.status === "voting");
  const badgeRows = (badges.data ?? []) as { label: string; count: number }[];
  const shareRows = (doneMissions ?? []) as { id: string; title: string }[];
  const certRows = (certs.data ?? []) as { code: string; period_label: string }[];

  return (
    <Section className="touch-44 max-w-3xl pb-24 pt-12">
      <Toaster />
      <Eyebrow>My work</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Your FusionX work.</h1>
      {collab.data && <p className="mt-2 inline-block border border-accent px-2 py-0.5 text-xs font-semibold text-accent-text" data-collaborator>Collaborator · until {dayLabel(collab.data.ends_on as string)}</p>}
      {todo > 0 && (
        <p className="mt-3 text-sm text-ink/75" data-work-summary>
          <strong className="text-ink">{todo} thing{todo === 1 ? "" : "s"} to do</strong>{nextDeadline ? <> · next deadline <strong className="text-ink">{dayLabel(nextDeadline)}</strong></> : null}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {/* ── Needs you now: only what has something in it, each with its deadline ── */}
        {nothing && (
          <p className="border border-dashed border-line p-4 text-sm text-ink/70" data-empty-work>
            You&apos;re all caught up ✓ When a task fits your skills, it is offered here and you get a notification.
            Add your skills on <Link href="/profile" className="underline">your profile</Link>, or pick an idea below.
          </p>
        )}

        {offerRows.length > 0 && (
          <Block id="offers" title={`Offers (${offerRows.length})`} hint={`Answer within ${offerHours} hours, or it goes to the next person.`}>
            <ul className="divide-y divide-line">
              {offerRows.map((o) => o.task && (
                <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-offer={o.id}>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{o.task.title}</p>
                    <p className="text-xs text-ink/60">{o.task.mission?.title} · {EFFORT_LABEL[o.task.effort]} · task <Due date={o.task.due_on} /></p>
                    <p className="mt-0.5"><By iso={new Date(Date.parse(o.offered_at) + offerHours * 3_600_000).toISOString()} label="Answer by" /></p>
                  </div>
                  <OfferButtons offerId={o.id} />
                </li>
              ))}
            </ul>
          </Block>
        )}

        {mineRows.length > 0 && (
          <Block id="tasks" title={`My tasks (${mineRows.length})`} hint="Close a task with its proof; a teammate reviews it.">
            <ul className="space-y-3">
              {mineRows.map((t) => (
                <li key={t.id} className="border border-line p-3" data-task={t.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{t.title}</p>
                    <span className="text-xs text-ink/70">{TASK_STATUS_LABEL[t.status]} · <Due date={t.due_on} /></span>
                  </div>
                  <p className="text-xs text-ink/60">{t.mission?.title} · proof: {PROOF_LABEL[t.proof]}</p>
                  {t.checklist.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-sm text-ink/75">{t.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
                  )}
                  {t.status === "submitted" ? (
                    <p className="mt-2 text-sm text-ink/70">Submitted. Waiting for the review.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <ProofForm taskId={t.id} proof={t.proof} userId={user.id} changes={t.status === "changes"} />
                      <RequestChange taskId={t.id} due={t.due_on} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {myProjectTasks.length > 0 && (
          <Block id="project-tasks" title={`Project tasks (${myProjectTasks.length})`}>
            <ul className="divide-y divide-line text-sm">
              {myProjectTasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/projects/${t.project?.id}/work`} className="text-ink hover:underline">{t.title}<span className="block text-xs text-ink/60">{t.project?.title}</span></Link>
                  {/* Every task shows a deadline: its own date, else its milestone's, else the project's target date. */}
                  {(() => {
                    const due = t.due_on ?? t.milestone?.due_on ?? t.project?.target_date ?? null;
                    if (!due) return <span className="text-xs font-semibold text-amber-700 dark:text-amber-400" data-no-deadline>No deadline yet: ask the owner to set one</span>;
                    return <span className="shrink-0 text-right"><Due date={due} />{!t.due_on && <span className="block text-[11px] text-ink/55">{t.milestone?.due_on ? "milestone date" : "project target"}</span>}</span>;
                  })()}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {reviewRows.length > 0 && (
          <Block id="reviews" title={`Reviews to give (${reviewRows.length})`} hint="Check the proof against the checklist. Approve, or say what needs to change.">
            <ul className="space-y-3">
              {reviewRows.map((r, i) => r.task && (
                <li key={r.id} className="border border-line p-3" data-review={r.id}>
                  <p className="font-medium text-ink">{r.task.title}</p>
                  <p className="text-xs text-ink/60">{r.task.mission?.title} · by {names.get(r.task.assignee_id ?? "")?.full_name ?? "a member"}</p>
                  {r.due_at && <p className="mt-0.5"><By iso={r.due_at} label="Review by" /></p>}
                  {r.task.proof_text && <p className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-ink/80">{r.task.proof_text}</p>}
                  {proofLinks[i] && <a href={proofLinks[i]!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-accent-text underline">Open the proof</a>}
                  <ReviewForm reviewId={r.id} />
                </li>
              ))}
            </ul>
          </Block>
        )}

        {(mySquads.invites.length > 0 || mySquads.squads.length > 0) && (
          <Block id="squads" title="Squads" hint="Your hackathon teams. Find one from any opportunity card: Find a team.">
            <MySquadsBlock data={mySquads} me={user.id} />
          </Block>
        )}

        {/* ── Ideas: the main thing to pick from ── */}
        <Block id="ideas" title={`Ideas for you (${current.length})`} hint="New every Sunday. Each one says until when you can pick it.">
          <nav aria-label="Idea filter" className="mb-3 flex gap-2 text-sm">
            <Link href="/my-work#ideas" className={`inline-flex min-h-11 items-center border px-3 ${ideaFilter !== "mine" ? "border-ink text-ink" : "border-line text-ink/70"}`}>All</Link>
            <Link href="/my-work?ideas=mine#ideas" className={`inline-flex min-h-11 items-center border px-3 ${ideaFilter === "mine" ? "border-ink text-ink" : "border-line text-ink/70"}`}>Suits my skills</Link>
          </nav>
          {current.length === 0 ? <Empty>No ideas yet. New ones arrive every Sunday morning.</Empty> : (
            <ul className="grid auto-rows-fr gap-3 md:grid-cols-2" data-ideas-for-you>{current.map((i) => <li key={i.id} className="min-w-0"><IdeaCard idea={i} /></li>)}</ul>
          )}
          {archive.length > 0 && (
            <details className="mt-4" data-idea-archive>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">Idea archive ({archive.length})</summary>
              <ul className="mt-2 grid auto-rows-fr gap-3 md:grid-cols-2">{archive.slice(0, 40).map((i) => <li key={i.id} className="min-w-0"><IdeaCard idea={i} /></li>)}</ul>
            </details>
          )}
        </Block>

        {communityOn && communityTasks.length > 0 && (
          <Block id="community" title={`Community tasks (${communityTasks.length})`} hint="Anyone can take one at a time. Approved work counts.">
            <ul className="divide-y divide-line">
              {communityTasks.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-community-task={t.id}>
                  <div className="min-w-0"><p className="font-medium text-ink">{t.title}</p><p className="text-xs text-ink/60">{t.mission?.title} · {EFFORT_LABEL[t.effort]} · <Due date={t.due_on} /></p></div>
                  <TakeTask taskId={t.id} />
                </li>
              ))}
            </ul>
          </Block>
        )}

        {/* ── More: closed until opened; each line says what is inside ── */}
        <h2 className="pt-4 text-xs font-semibold uppercase tracking-wider text-ink/60">More</h2>

        <Fold id="checkin" title="Weekly check-in" summary={`Due every ${checkinDay} · ${checkinRow ? "sent this week ✓" : "not sent yet"}`}>
          <p className="mb-3 text-sm text-ink/65">One minute: what you did, what is next, and anything blocking you (your lead is told).</p>
          <CheckinForm initial={checkinRow} />
        </Fold>

        <Fold id="opportunities" title="Top 5 opportunities for you" summary={top5.length ? `${top5.length} open · next closes ${dayLabel([...top5].sort((a, b) => a.deadline.localeCompare(b.deadline))[0].deadline)}` : "None open right now"}>
          {top5.length > 0 && (
            <ul className="divide-y divide-line text-sm" data-top5>
              {top5.map((o) => (
                <li key={o.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between">
                  {o.registration_url ? <a href={o.registration_url} target="_blank" rel="noopener noreferrer" className="text-ink underline-offset-2 hover:underline">{o.title}</a> : <span className="text-ink">{o.title}</span>}
                  <span className="text-xs text-ink/60">closes {dayLabel(o.deadline)}{o.mode === "online" ? " · online" : o.city ? ` · ${o.city}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-4"><Link href="/opportunities" className="text-sm text-accent-text underline">All opportunities</Link><SuggestOpportunity /></div>
        </Fold>

        <Fold id="pitches" title="Pitches" summary={votingNow.length ? `${votingNow.length} in voting · vote or pitch your own` : "Pitch an idea; members vote for 5 days"}>
          <PitchForm />
          {pitches.length > 0 && (
            <ul className="mt-4 space-y-3">
              {pitches.map((p) => (
                <li key={p.id} className="border border-line p-3" data-pitch={p.id}>
                  <p className="font-medium text-ink">{p.title} <span className="text-xs font-normal text-ink/60">· by {p.pitched_by_name} · {p.votes} vote{p.votes === 1 ? "" : "s"} · {p.status === "voting" ? `voting until ${dayLabel(p.voting_ends_at.slice(0, 10))}` : p.status}</span></p>
                  <p className="text-sm text-ink/75">{p.summary}</p>
                  {p.status === "voting" && !p.mine ? <PitchVote pitchId={p.id} options={p.options ?? []} mine={p.my_vote} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Fold>

        <Fold id="busy" title="Busy dates" summary={busyRows.length ? `${busyRows.length} set · no new tasks on these days` : "Exams or travel? Add them: no new tasks on those days"}>
          <BusyDates rows={busyRows} />
        </Fold>

        <Fold id="contributions" title="Contributions" summary={contribRows.length ? `${contribRows.length} verified · download as PDF` : "Your approved work appears here"}>
          {contribRows.length === 0 ? <Empty>Your approved tasks will appear here.</Empty> : (
            <>
              <ul className="divide-y divide-line text-sm">
                {contribRows.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 text-ink">{c.title}<span className="block text-xs text-ink/60">{c.mission?.title}</span></span>
                    <span className="shrink-0 text-xs text-ink/60">{dayLabel(c.contributed_on)}</span>
                  </li>
                ))}
              </ul>
              <a href="/my-work/contributions" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text underline" download>
                <Download size={14} aria-hidden /> Download as PDF
              </a>
            </>
          )}
          {badgeRows.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" data-badges>
              {badgeRows.map((b) => <li key={b.label} className="border border-accent px-2 py-0.5 text-sm font-medium text-accent-text">{b.label} ×{b.count}</li>)}
            </ul>
          )}
          {certRows.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {certRows.map((c) => (
                <li key={c.code} className="flex flex-wrap justify-between gap-2"><span>Certificate · {c.period_label}</span><span className="flex gap-3"><a href={`/api/autopilot/certificate/${c.code}`} className="underline">Download PDF</a><Link href={`/verify/${c.code}`} className="underline">Verify</Link></span></li>
              ))}
            </ul>
          )}
        </Fold>

        {shareRows.length > 0 && (
          <Fold id="share" title="Share your work" summary={`${shareRows.length} finished mission${shareRows.length === 1 ? "" : "s"} · a LinkedIn card for each`}>
            <ul className="space-y-2">
              {shareRows.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-ink">{m.title}</span><ShareCardButton missionId={m.id} code={cardBy.get(m.id) ?? null} /></li>
              ))}
            </ul>
          </Fold>
        )}

        {myMissions.size > 0 && (
          <Fold id="missions" title="My missions" summary={`${myMissions.size} mission${myMissions.size === 1 ? "" : "s"}`}>
            <ul className="space-y-1 text-sm">
              {[...myMissions.values()].map((m) => (
                <li key={m.id} className="flex justify-between gap-2"><span className="text-ink">{m.title}</span><span className="text-ink/60">{STATUS_LABEL[m.status]}</span></li>
              ))}
            </ul>
          </Fold>
        )}

        <Fold id="settings" title="Settings" summary="Notifications, phone alerts, showing your name on public pages">
          <PreferencesForm delivery={(prefs.data?.delivery as "instant" | "daily" | undefined) ?? "instant"} push={(prefs.data?.push as boolean | undefined) ?? true} />
          <div className="mt-4"><PushToggle subscribed={(subs.data ?? []).map((s) => s.endpoint as string)} /></div>
          {me.data && <div className="mt-4"><ShowOnImpact show={me.data.show_on_impact !== false} /></div>}
          {communityOn && <p className="mt-4 text-sm"><Link href="/autopilot/open-seats" className="text-accent-text underline">Open seats on missions</Link></p>}
        </Fold>
      </div>
    </Section>
  );
}
