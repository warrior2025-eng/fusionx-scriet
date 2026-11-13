import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { BusyDates, CheckinForm, OfferButtons, PreferencesForm, ProofForm, PushToggle, RequestChange, ReviewForm } from "@/components/autopilot/work-parts";
import { PitchForm, PitchVote, TakeTask } from "@/components/autopilot/people-parts";
import { SavedIdea, ShareCardButton, ShowOnImpact, SuggestOpportunity } from "@/components/autopilot/outcome-parts";
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
    supabase.from("project_tasks").select("id, title, due_on, project:projects(id, title)").eq("assignee_id", user.id).is("done_at", null).is("mission_task_id", null).order("due_on", { nullsFirst: false }),
    supabase.from("collaborators").select("ends_on").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabase.from("community_settings").select("community_on").eq("id", 1).maybeSingle(),
    // Migration 0044 (outcomes); empty before it.
    supabase.from("skill_badges").select("label, count").eq("user_id", user.id).order("count", { ascending: false }),
    supabase.from("share_cards").select("code, mission_id").eq("user_id", user.id),
    supabase.from("certificate_verifications").select("code, period_label, issued_at").eq("user_id", user.id).eq("status", "issued"),
    supabase.rpc("ap_saved_ideas"),
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
  type Idea = { id: string; title: string; pitch: string; likes: number; liked: boolean };
  type Pitch = { id: string; title: string; summary: string; pitched_by_name: string; mine: boolean; status: string; voting_ends_at: string; options: { key: string; name: string; description: string; votes: number }[] | null; my_vote: string | null; votes: number };
  const pitches = (pitchBoard.data ?? []) as Pitch[];
  const communityTasks = ((community.data ?? []) as unknown as { id: string; title: string; due_on: string; hub: string; effort: string; proof: string; mission: { title: string; status: string } | null }[])
    .filter((t) => t.mission && ["planned", "active"].includes(t.mission.status));
  const myProjectTasks = (projectTasks.data ?? []) as unknown as { id: string; title: string; due_on: string | null; project: { id: string; title: string } | null }[];
  const communityOn = settings.data?.community_on !== false;

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
      {collab.data && <p className="mt-2 inline-block border border-accent px-2 py-0.5 text-xs font-semibold text-accent-text" data-collaborator>Collaborator · until {dayLabel(collab.data.ends_on as string)}</p>}
      <p className="mt-2 text-sm text-ink/65">
        Offers to answer, tasks with their dates, reviews to give. Everything you finish and get approved becomes a verified contribution.
      </p>
      <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-2 text-sm">
        {[["#offers", `Offers (${offerRows.length})`], ["#tasks", `Tasks (${mineRows.length + myProjectTasks.length})`], ["#reviews", `Reviews (${reviewRows.length})`], ["#community", "Community tasks"], ["#pitches", "Pitches"], ["#checkin", "Check-in"], ["#contributions", "Contributions"], ["#settings", "Settings"]].map(([href, label]) => (
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

        {myProjectTasks.length > 0 && (
          <Block id="project-tasks" title="My project tasks" hint="From your projects' milestones.">
            <ul className="divide-y divide-line text-sm">
              {myProjectTasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/projects/${t.project?.id}/work`} className="text-ink hover:underline">{t.title}<span className="block text-xs text-ink/60">{t.project?.title}</span></Link>
                  {t.due_on && <Due date={t.due_on} />}
                </li>
              ))}
            </ul>
          </Block>
        )}

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

        {communityOn && (
          <Block id="community" title="Community tasks" hint="Open tasks anyone signed in can take, one at a time. Same proof and review; approved work counts.">
            {communityTasks.length === 0 ? <Empty>None open right now.</Empty> : (
              <ul className="divide-y divide-line">
                {communityTasks.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-community-task={t.id}>
                    <div className="min-w-0"><p className="font-medium text-ink">{t.title}</p><p className="text-xs text-ink/60">{t.mission?.title} · {hubLabel(t.hub)} · {EFFORT_LABEL[t.effort]} · <Due date={t.due_on} /></p></div>
                    <TakeTask taskId={t.id} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm"><Link href="/autopilot/open-seats" className="text-accent-text underline">Open seats on missions</Link></p>
          </Block>
        )}

        <Block id="pitches" title="Pitches" hint="Pitch an idea; members vote for 5 days; a lead can turn the winner into a mission with your name on it.">
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

        {(badges.data ?? []).length > 0 && (
          <Block id="badges" title="Skill badges" hint="From your verified contributions.">
            <ul className="flex flex-wrap gap-2" data-badges>
              {((badges.data ?? []) as { label: string; count: number }[]).map((b) => <li key={b.label} className="border border-accent px-2 py-0.5 text-sm font-medium text-accent-text">{b.label} ×{b.count}</li>)}
            </ul>
          </Block>
        )}

        {((doneMissions ?? []) as { id: string; title: string }[]).length > 0 && (
          <Block id="share" title="Share your work" hint="A LinkedIn card for each finished public mission you worked on. Only your verified tasks; nothing is posted for you.">
            <ul className="space-y-2">
              {((doneMissions ?? []) as { id: string; title: string }[]).map((m) => (
                <li key={m.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-ink">{m.title}</span><ShareCardButton missionId={m.id} code={cardBy.get(m.id) ?? null} /></li>
              ))}
            </ul>
          </Block>
        )}

        {(certs.data ?? []).length > 0 && (
          <Block id="certificates" title="Certificates">
            <ul className="space-y-1 text-sm">
              {((certs.data ?? []) as { code: string; period_label: string }[]).map((c) => (
                <li key={c.code} className="flex flex-wrap justify-between gap-2"><span>{c.period_label} · {c.code}</span><span className="flex gap-3"><a href={`/api/autopilot/certificate/${c.code}`} className="underline">Download PDF</a><Link href={`/verify/${c.code}`} className="underline">Verify page</Link></span></li>
              ))}
            </ul>
          </Block>
        )}

        <Block id="opportunities" title="Top 5 for you" hint="Open opportunities, closest and most urgent first, then the ones that fit your skills.">
          {top5.length === 0 ? <Empty>None open right now.</Empty> : (
            <ul className="divide-y divide-line text-sm" data-top5>
              {top5.map((o) => (
                <li key={o.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between">
                  {o.registration_url ? <a href={o.registration_url} target="_blank" rel="noopener noreferrer" className="text-ink underline-offset-2 hover:underline">{o.title}</a> : <span className="text-ink">{o.title}</span>}
                  <span className="text-xs text-ink/60">{o.organizer} · closes {dayLabel(o.deadline)}{o.distance_km !== null ? ` · ~${o.distance_km} km` : o.mode === "online" ? " · online" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-4"><Link href="/opportunities" className="text-sm text-accent-text underline">All opportunities</Link><SuggestOpportunity /></div>
        </Block>

        {((savedIdeas.data ?? []) as Idea[]).length > 0 && (
          <Block id="ideas" title="Project ideas to start" hint="Saved by the team from the Idea Engine. Like one, or start it as your own project with a plan.">
            <ul className="space-y-3">
              {((savedIdeas.data ?? []) as Idea[]).map((i) => (
                <li key={i.id} className="border border-line p-3"><p className="font-medium text-ink">{i.title}</p><p className="text-sm text-ink/75">{i.pitch}</p><SavedIdea id={i.id} liked={i.liked} likes={i.likes} /></li>
              ))}
            </ul>
          </Block>
        )}

        <Block id="settings" title="Notifications">
          <PreferencesForm delivery={(prefs.data?.delivery as "instant" | "daily" | undefined) ?? "instant"} push={(prefs.data?.push as boolean | undefined) ?? true} />
          <div className="mt-4"><PushToggle subscribed={(subs.data ?? []).map((s) => s.endpoint as string)} /></div>
          {me.data && <div className="mt-4"><ShowOnImpact show={me.data.show_on_impact !== false} /></div>}
        </Block>
      </div>
    </Section>
  );
}
