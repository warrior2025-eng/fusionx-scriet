import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { BusyDates, CheckinForm, OfferButtons, PreferencesForm, ProofForm, PushToggle, RequestChange, ReviewForm } from "@/components/autopilot/work-parts";
import { dayLabel, daysFromToday, getAutopilotViewer, peopleById, proofHref, todayIST, type TaskRow } from "@/lib/autopilot/server";
import { EFFORT_LABEL, PROOF_LABEL, STATUS_LABEL, TASK_STATUS_LABEL, hubLabel } from "@/lib/autopilot/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My work" };

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

export default async function MyWorkPage() {
  const viewer = await getAutopilotViewer();
  if (!viewer) redirect("/login?next=/my-work");
  const { supabase, user } = viewer;
  const today = todayIST();
  const d = new Date(`${today}T00:00:00Z`);
  const week = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);

  const [offers, mine, reviews, busy, checkin, prefs, subs, contributions, owned] = await Promise.all([
    supabase.from("task_offers").select("id, offered_at, task:mission_tasks(id, title, due_on, effort, hub, proof, mission:missions(title))").eq("user_id", user.id).eq("status", "offered").order("offered_at"),
    supabase.from("mission_tasks").select("*, mission:missions(id, title, status)").eq("assignee_id", user.id).in("status", ["accepted", "changes", "submitted"]).order("due_on"),
    supabase.from("task_reviews").select("id, kind, due_at, task:mission_tasks(id, title, proof, proof_text, proof_url, assignee_id, checklist, mission:missions(title))").eq("reviewer_id", user.id).eq("status", "pending").order("due_at"),
    supabase.from("availability").select("id, starts_on, ends_on, note").eq("user_id", user.id).gte("ends_on", today).order("starts_on"),
    supabase.from("checkins").select("done, next, blocked").eq("user_id", user.id).eq("week_start", week).maybeSingle(),
    supabase.from("work_preferences").select("delivery, push").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("user_id", user.id),
    supabase.from("contributions").select("id, title, skill, contributed_on, mission:missions(title)").eq("user_id", user.id).eq("counts", true).order("contributed_on", { ascending: false }).limit(50),
    supabase.from("missions").select("id, title, status, mission_date").eq("owner_id", user.id).in("status", ["planned", "active", "review"]).order("mission_date"),
  ]);

  type Offer = { id: string; task: { id: string; title: string; due_on: string; effort: string; hub: string; proof: string; mission: { title: string } | null } | null };
  type Mine = TaskRow & { mission: { id: string; title: string; status: string } | null };
  type Review = { id: string; kind: string; due_at: string; task: { id: string; title: string; proof: string; proof_text: string | null; proof_url: string | null; assignee_id: string | null; checklist: string[]; mission: { title: string } | null } | null };
  const offerRows = (offers.data ?? []) as unknown as Offer[];
  const mineRows = (mine.data ?? []) as unknown as Mine[];
  const reviewRows = (reviews.data ?? []) as unknown as Review[];
  const contribRows = (contributions.data ?? []) as unknown as { id: string; title: string; skill: string | null; contributed_on: string; mission: { title: string } | null }[];
  const names = await peopleById(supabase, reviewRows.map((r) => r.task?.assignee_id));
  const proofLinks = await Promise.all(reviewRows.map((r) => proofHref(supabase, r.task?.proof_url ?? null)));
  const myMissions = new Map<string, { id: string; title: string; status: string }>();
  for (const t of mineRows) if (t.mission) myMissions.set(t.mission.id, t.mission);
  for (const m of owned.data ?? []) myMissions.set(m.id as string, { id: m.id as string, title: `${m.title} (you own it)`, status: m.status as string });
  const nothing = offerRows.length + mineRows.length + reviewRows.length === 0;

  return (
    <Section className="max-w-3xl pb-24 pt-12">
      <Toaster />
      <Eyebrow>My work</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Your FusionX tasks.</h1>
      <p className="mt-2 text-sm text-ink/65">
        Offers to answer, tasks with their dates, reviews to give. Everything you finish and get approved becomes a verified contribution.
      </p>
      <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-2 text-sm">
        {[["#offers", `Offers (${offerRows.length})`], ["#tasks", `Tasks (${mineRows.length})`], ["#reviews", `Reviews (${reviewRows.length})`], ["#checkin", "Check-in"], ["#contributions", "Contributions"], ["#settings", "Settings"]].map(([href, label]) => (
          <a key={href} href={href} className="border border-line px-2.5 py-1 text-ink/75 hover:border-ink/40 hover:text-ink">{label}</a>
        ))}
      </nav>

      <div className="mt-8 space-y-5">
        {nothing && (
          <p className="border border-dashed border-line p-4 text-sm text-ink/70" data-empty-work>
            Nothing waiting for you right now. When a task fits your hub and skills, it is offered here and you get a notification.
            Add your skills on <Link href="/profile" className="underline">your profile</Link> so the right tasks find you.
          </p>
        )}

        <Block id="offers" title="Offers" hint="A task offered to you. Answer within a day, or it goes to the next person.">
          {offerRows.length === 0 ? <Empty>No offers right now.</Empty> : (
            <ul className="divide-y divide-line">
              {offerRows.map((o) => o.task && (
                <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-offer={o.id}>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{o.task.title}</p>
                    <p className="text-xs text-ink/60">{o.task.mission?.title} · {hubLabel(o.task.hub)} · {EFFORT_LABEL[o.task.effort]} · proof: {PROOF_LABEL[o.task.proof]} · <Due date={o.task.due_on} /></p>
                  </div>
                  <OfferButtons offerId={o.id} />
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block id="tasks" title="My tasks" hint="Due soon first. Close a task with its proof; a teammate reviews it.">
          {mineRows.length === 0 ? <Empty>No tasks in progress.</Empty> : (
            <ul className="space-y-3">
              {mineRows.map((t) => (
                <li key={t.id} className="border border-line p-3" data-task={t.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{t.title}</p>
                    <span className="text-xs text-ink/70">{TASK_STATUS_LABEL[t.status]} · <Due date={t.due_on} /></span>
                  </div>
                  <p className="text-xs text-ink/60">{t.mission?.title} · {hubLabel(t.hub)} · proof: {PROOF_LABEL[t.proof]}</p>
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
          )}
        </Block>

        <Block id="reviews" title="Reviews to give" hint="Check the proof against the checklist. Approve, or say what needs to change.">
          {reviewRows.length === 0 ? <Empty>No reviews waiting.</Empty> : (
            <ul className="space-y-3">
              {reviewRows.map((r, i) => r.task && (
                <li key={r.id} className="border border-line p-3" data-review={r.id}>
                  <p className="font-medium text-ink">{r.task.title}</p>
                  <p className="text-xs text-ink/60">{r.task.mission?.title} · by {names.get(r.task.assignee_id ?? "")?.full_name ?? "a member"} · {r.kind} review</p>
                  {r.task.proof_text && <p className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-ink/80">{r.task.proof_text}</p>}
                  {proofLinks[i] && <a href={proofLinks[i]!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-accent-text underline">Open the proof</a>}
                  <ReviewForm reviewId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block id="missions" title="My missions">
          {myMissions.size === 0 ? <Empty>You are not in a mission yet.</Empty> : (
            <ul className="space-y-1 text-sm">
              {[...myMissions.values()].map((m) => (
                <li key={m.id} className="flex justify-between gap-2"><span className="text-ink">{m.title}</span><span className="text-ink/60">{STATUS_LABEL[m.status]}</span></li>
              ))}
            </ul>
          )}
        </Block>

        <Block id="busy" title="Busy dates" hint="Exams, travel, anything: you get no new tasks on these days.">
          <BusyDates rows={(busy.data ?? []) as { id: string; starts_on: string; ends_on: string; note: string | null }[]} />
        </Block>

        <Block id="checkin" title="Weekly check-in" hint="One minute: what you did, what is next, and anything blocking you (your lead is told).">
          <CheckinForm initial={(checkin.data as { done: string | null; next: string | null; blocked: string | null } | null) ?? null} />
        </Block>

        <Block id="contributions" title="Contributions" hint="Approved work only. Nobody can add entries for themselves.">
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
        </Block>

        <Block id="settings" title="Notifications">
          <PreferencesForm delivery={(prefs.data?.delivery as "instant" | "daily" | undefined) ?? "instant"} push={(prefs.data?.push as boolean | undefined) ?? true} />
          <div className="mt-4"><PushToggle subscribed={(subs.data ?? []).map((s) => s.endpoint as string)} /></div>
        </Block>
      </div>
    </Section>
  );
}
