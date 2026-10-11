import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, ExternalLink } from "lucide-react";
import {
  inviteToTeam,
  leaveTeam,
  removeMember,
  requestToJoin,
  respondJoinRequest,
  revokeInvite,
  transferLeadership,
  updateTeam,
} from "@/actions/teams";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, SelectField, TextareaField } from "@/components/admin/admin-form";
import { Toaster } from "@/components/admin/toast";
import { Pill, formatDate } from "@/components/admin/ui";
import { TeamDetailFields } from "@/components/teams/team-fields";
import { Badge } from "@/components/ui/badge";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { siteUrl } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";
import {
  TEAM_STATUS_LABELS,
  TEAM_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_TONE,
  getFocusCategories,
  getTeamSettings,
  type RosterMember,
  type Team,
} from "@/lib/teams/data";

export const metadata: Metadata = { title: "Team" };

type Invite = { id: string; email: string; token: string; expires_at: string };
type JoinRequest = { id: string; user_id: string; full_name: string; department: string | null; year: string | null; message: string | null };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/teams/${id}`);

  // Null unless the team is verified or the caller belongs to it.
  const { data: teamRow } = await supabase.from("teams").select("*").eq("id", id).maybeSingle();
  if (!teamRow) notFound();
  const team = teamRow as Team;

  const { data: rosterRows } = await supabase.rpc("team_roster", { p_team: id });
  const roster = (rosterRows ?? []) as RosterMember[];
  const isLeader = team.leader_id === user.id;
  const isMember = roster.some((m) => m.user_id === user.id);
  const open = team.status === "forming" || team.status === "active";
  const verified = team.verification_status === "verified";

  const [settings, categories, { data: inviteRows }, { data: requestRows }, { data: myRequest }, { data: whatsapp }] = await Promise.all([
    getTeamSettings(),
    isLeader ? getFocusCategories() : Promise.resolve([] as string[]),
    isLeader
      ? supabase.from("team_invites").select("id, email, token, expires_at").eq("team_id", id).eq("status", "pending").order("created_at")
      : Promise.resolve({ data: [] }),
    isLeader ? supabase.rpc("team_join_requests_for", { p_team: id }) : Promise.resolve({ data: [] }),
    !isMember
      ? supabase.from("team_join_requests").select("id").eq("team_id", id).eq("user_id", user.id).eq("status", "pending").maybeSingle()
      : Promise.resolve({ data: null }),
    // Returns nothing unless the team is verified and the caller is on it.
    isMember && verified ? supabase.rpc("fusionx_teams_whatsapp", { p_team: id }) : Promise.resolve({ data: null }),
  ]);
  const invites = (inviteRows ?? []) as Invite[];
  const requests = (requestRows ?? []) as JoinRequest[];
  const capacity = Math.min(team.max_size ?? settings.maxSize, settings.maxSize);
  const full = roster.length >= capacity;
  const groupLink = typeof whatsapp === "string" && /^https:\/\//i.test(whatsapp) ? whatsapp : null;

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx max-w-4xl pb-10 pt-20 md:pt-24">
          <Eyebrow>FusionX Teams</Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            {verified ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
                <BadgeCheck size={17} aria-hidden /> Verified team
              </span>
            ) : (
              <Pill tone={VERIFICATION_TONE[team.verification_status]}>{VERIFICATION_LABELS[team.verification_status]}</Pill>
            )}
            {team.focus && <Badge className="rounded-none">{team.focus}</Badge>}
            <Pill>{TEAM_STATUS_LABELS[team.status]}</Pill>
            {team.looking_for_members && open && <Pill tone="good">Looking for members</Pill>}
          </div>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-ink md:text-5xl">{team.name}</h1>
          <p className="mt-3 text-sm text-ink/70">
            {TEAM_TYPE_LABELS[team.team_type]}, {roster.length} of {capacity} member{capacity === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      <Section className="max-w-4xl space-y-6">
        <Toaster />

        {!verified && isMember && (
          <p className="border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-ink">
            {team.verification_status === "pending"
              ? "FusionX has not verified this team yet. It is visible only to its members until then."
              : "FusionX did not verify this team. It is visible only to its members."}
          </p>
        )}

        <CutCard className="h-auto">
          {team.project_title && <h2 className="font-serif text-2xl text-ink">{team.project_title}</h2>}
          {team.project_summary && <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/80">{team.project_summary}</p>}
          {team.description && (
            <div className={team.project_title || team.project_summary ? "mt-6 border-t border-line pt-5" : ""}>
              <p className="text-sm font-medium text-ink">About the team</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/75">{team.description}</p>
            </div>
          )}
          {!team.project_title && !team.project_summary && !team.description && <p className="text-sm text-ink/65">No details added yet.</p>}
          {team.skills_needed?.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {team.skills_needed.map((s) => (
                <li key={s} className="border border-ink/10 px-2.5 py-0.5 text-xs text-ink/70">
                  {s}
                </li>
              ))}
            </ul>
          )}
          {(team.github_url || team.demo_url) && (
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {[team.github_url, team.demo_url].filter((url): url is string => Boolean(url) && /^https?:\/\//i.test(url ?? "")).map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 break-all font-medium text-accent">
                  <ExternalLink size={14} aria-hidden /> {url}
                </a>
              ))}
            </p>
          )}
          {groupLink && (
            <a
              href={groupLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary mt-6 inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              Join the FusionX Teams WhatsApp group
            </a>
          )}
        </CutCard>

        <CutCard className="h-auto">
          <h2 className="font-serif text-xl text-ink">Members</h2>
          <ul className="mt-4 divide-y divide-line">
            {roster.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0 text-sm text-ink">
                  <span className="font-medium">{m.full_name}</span>
                  {m.user_id === team.leader_id && <span className="ml-2 text-xs font-semibold text-accent">Leader</span>}
                  {(m.department || m.year) && <span className="block text-ink/65">{[m.department, m.year].filter(Boolean).join(", ")}</span>}
                </span>
                {isLeader && m.user_id !== user.id && (
                  <span className="flex flex-wrap gap-2">
                    <ActionButton
                      variant="ghost"
                      action={transferLeadership.bind(null, id, m.user_id)}
                      confirm={{ title: "Hand the team over?", body: `${m.full_name} becomes the leader. You stay on as a member.`, confirmLabel: "Hand over" }}
                    >
                      Make leader
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      danger
                      action={removeMember.bind(null, id, m.user_id)}
                      confirm={{ title: "Remove this member?", body: `${m.full_name} will be taken off the team.`, confirmLabel: "Remove" }}
                    >
                      Remove
                    </ActionButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {isMember && (
            <div className="mt-5 border-t border-line pt-5">
              <ActionButton
                variant="ghost"
                danger
                action={leaveTeam.bind(null, id)}
                confirm={{
                  title: "Leave this team?",
                  body: isLeader ? "If other members remain, hand the team over first. If you are the last member, the team is archived." : "You will be taken off the team.",
                  confirmLabel: "Leave",
                }}
              >
                Leave team
              </ActionButton>
            </div>
          )}
        </CutCard>

        {/* Someone who is not on the team: ask to join */}
        {!isMember && verified && open && (
          <CutCard className="h-auto">
            <h2 className="font-serif text-xl text-ink">Join this team</h2>
            {myRequest ? (
              <p className="mt-3 text-sm text-ink/75">Your request is with the team leader. You will get a notification when it is answered.</p>
            ) : !team.looking_for_members ? (
              <p className="mt-3 text-sm text-ink/75">This team is not looking for members right now.</p>
            ) : full ? (
              <p className="mt-3 text-sm text-ink/75">This team is full.</p>
            ) : (
              <div className="mt-4">
                <AdminForm action={requestToJoin.bind(null, id)} submitLabel="Request to join" warnUnsaved={false}>
                  <TextareaField name="message" label="Message to the leader (optional)" rows={3} max={500} counter />
                </AdminForm>
              </div>
            )}
          </CutCard>
        )}

        {isLeader && (
          <>
            {requests.length > 0 && (
              <CutCard className="h-auto">
                <h2 className="font-serif text-xl text-ink">Requests to join</h2>
                <ul className="mt-4 divide-y divide-line">
                  {requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <span className="min-w-0 text-sm text-ink">
                        <span className="font-medium">{r.full_name}</span>
                        {(r.department || r.year) && <span className="ml-2 text-ink/65">{[r.department, r.year].filter(Boolean).join(", ")}</span>}
                        {r.message && <span className="mt-1 block whitespace-pre-line text-ink/75">{r.message}</span>}
                      </span>
                      <span className="flex gap-2">
                        <ActionButton variant="primary" action={respondJoinRequest.bind(null, id, r.id, true)}>
                          Approve
                        </ActionButton>
                        <ActionButton action={respondJoinRequest.bind(null, id, r.id, false)}>Decline</ActionButton>
                      </span>
                    </li>
                  ))}
                </ul>
              </CutCard>
            )}

            <CutCard className="h-auto">
              <h2 className="font-serif text-xl text-ink">Invite members</h2>
              {invites.length > 0 && (
                <ul className="mt-4 divide-y divide-line">
                  {invites.map((invite) => (
                    <li key={invite.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="break-all text-sm text-ink">
                          {invite.email}
                          <span className="ml-2 text-ink/60">expires {formatDate(invite.expires_at)}</span>
                        </span>
                        <ActionButton variant="ghost" danger action={revokeInvite.bind(null, id, invite.id)}>
                          Withdraw
                        </ActionButton>
                      </div>
                      <label className="mt-2 block text-xs text-ink/60">
                        Link to send them (works after they sign up with this email)
                        <input
                          readOnly
                          value={`${siteUrl}/teams/invite/${invite.token}`}
                          className="mt-1 w-full rounded-sm border border-ink/15 bg-surface px-3 py-2 text-xs text-ink"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {open && !full ? (
                <div className="mt-5">
                  <AdminForm action={inviteToTeam.bind(null, id)} submitLabel="Create invitations" warnUnsaved={false}>
                    <TextareaField name="emails" label="Email addresses" rows={2} hint={`One per line. Invitations last ${settings.inviteExpiryDays} days.`} />
                  </AdminForm>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/70">{full ? "The team is full." : "This team is no longer taking members."}</p>
              )}
            </CutCard>

            <CutCard className="h-auto">
              <h2 className="mb-4 font-serif text-xl text-ink">Edit team</h2>
              <AdminForm action={updateTeam.bind(null, id)}>
                <TeamDetailFields team={team} categories={categories} minSize={Math.max(roster.length, 1)} maxSize={settings.maxSize} />
                <SelectField
                  name="status"
                  label="Status"
                  defaultValue={team.status}
                  options={(["forming", "active", "completed"] as const)
                    .map((s) => ({ value: s as string, label: TEAM_STATUS_LABELS[s] }))
                    .concat(team.status === "archived" ? [{ value: "archived", label: TEAM_STATUS_LABELS.archived }] : [])}
                />
              </AdminForm>
              <p className="mt-4 text-sm text-ink/65">To change the team&rsquo;s name, ask a FusionX admin.</p>
            </CutCard>
          </>
        )}

        <p className="text-sm">
          <Link href="/teams" className="text-ink/70 underline underline-offset-2 hover:text-ink">
            Back to all teams
          </Link>
        </p>
      </Section>
    </>
  );
}
