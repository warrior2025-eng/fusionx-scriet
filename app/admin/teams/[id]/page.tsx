import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  adminAddMember,
  adminRemoveMember,
  adminRevokeInvite,
  adminTransferLeadership,
  deleteTeam,
  saveTeamAdmin,
  saveTeamNote,
  verifyTeam,
} from "@/actions/admin-teams";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel, Pill, formatDate } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { TEAM_STATUS_LABELS, TEAM_TYPE_LABELS, VERIFICATION_LABELS, VERIFICATION_TONE, type RosterMember, type Team } from "@/lib/teams/data";

export const metadata: Metadata = { title: "Admin: Team" };

export default async function TeamAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("moderation", "/admin/teams");
  const canManage = ctx.caps.includes("teams.manage");
  const { data } = await ctx.supabase.from("teams").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const team = data as Team;

  const [{ data: rosterRows }, { data: inviteRows }, { data: note }, { data: requestRows }] = await Promise.all([
    ctx.supabase.rpc("team_roster", { p_team: id }),
    ctx.supabase.from("team_invites").select("id, email, status, expires_at").eq("team_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("team_admin_notes").select("note").eq("team_id", id).maybeSingle(),
    ctx.supabase.rpc("team_join_requests_for", { p_team: id }),
  ]);
  const roster = (rosterRows ?? []) as RosterMember[];
  const invites = (inviteRows ?? []) as { id: string; email: string; status: string; expires_at: string }[];
  const requests = (requestRows ?? []) as { id: string; full_name: string }[];

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-ink/65">{label}</dt>
      <dd className="whitespace-pre-line break-words text-sm text-ink sm:col-span-2">{value || <span className="text-ink/50">Not given</span>}</dd>
    </div>
  );

  return (
    <AdminPage
      title={team.name}
      crumbs={[{ label: "FusionX Teams", href: "/admin/teams" }, { label: team.name }]}
      actions={
        <>
          <Pill tone={VERIFICATION_TONE[team.verification_status]}>{VERIFICATION_LABELS[team.verification_status]}</Pill>
          <LinkButton href={`/teams/${id}`} variant="secondary" size="sm">
            View on site
          </LinkButton>
        </>
      }
    >
      <div className="space-y-6">
        <Panel title="What the team registered">
          <dl className="divide-y divide-line">
            {row("Type", TEAM_TYPE_LABELS[team.team_type])}
            {row("Focus", team.focus)}
            {row("Project", team.project_title)}
            {row("Summary", team.project_summary)}
            {row("About", team.description)}
            {row("Skills", (team.skills_needed ?? []).join(", "))}
            {row("Links", [team.github_url, team.demo_url].filter(Boolean).join("\n"))}
            {row("Size", `${roster.length} of ${team.max_size ?? "the limit"}`)}
            {row("Looking for members", team.looking_for_members ? "Yes" : "No")}
            {row("Registered", formatDate(team.created_at, true))}
            {team.verified_at && row("Verified", formatDate(team.verified_at, true))}
          </dl>
        </Panel>

        {canManage && (
          <Panel title="Verification" description="A verified team is listed at /teams and its members can open the FusionX Teams WhatsApp link. The leader is notified of the decision, with your note.">
            <AdminForm action={verifyTeam.bind(null, id)} submitLabel="Save decision" warnUnsaved={false}>
              <SelectField
                name="decision"
                label="Decision"
                defaultValue={team.verification_status}
                options={[
                  { value: "verified", label: "Verify" },
                  { value: "rejected", label: "Reject" },
                  { value: "pending", label: "Back to pending" },
                ]}
              />
              <TextareaField name="note" label="Note to the leader (optional)" rows={2} max={500} />
            </AdminForm>
          </Panel>
        )}

        <Panel title="Edit">
          <AdminForm action={saveTeamAdmin.bind(null, id)}>
            <TextField name="name" label="Team name" defaultValue={team.name} maxLength={120} />
            <SelectField
              name="status"
              label="Status"
              defaultValue={team.status}
              options={(["forming", "active", "completed", "archived"] as const).map((s) => ({ value: s, label: TEAM_STATUS_LABELS[s] }))}
              hint="A completed or archived team takes no new members."
            />
            {canManage && <CheckboxField name="is_featured" label="Featured" hint="Shown first in the list at /teams." defaultChecked={team.is_featured} />}
          </AdminForm>
        </Panel>

        <Panel title="Staff note" description="Only staff see this.">
          <AdminForm action={saveTeamNote.bind(null, id)} submitLabel="Save note">
            <TextareaField name="note" label="Note" rows={3} max={2000} defaultValue={(note?.note as string | undefined) ?? ""} />
          </AdminForm>
        </Panel>

        <Panel title={`Members (${roster.length})`}>
          <ul className="divide-y divide-line border border-line">
            {roster.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                <span>
                  <span className="font-medium">{m.full_name}</span>
                  {m.user_id === team.leader_id && <span className="ml-2 text-xs font-semibold text-accent">Leader</span>}
                  {(m.department || m.year) && <span className="ml-2 text-ink/60">{[m.department, m.year].filter(Boolean).join(", ")}</span>}
                </span>
                {canManage && m.user_id !== team.leader_id && (
                  <span className="flex gap-2">
                    <ActionButton variant="ghost" action={adminTransferLeadership.bind(null, id, m.user_id)} confirm={{ title: "Make this member the leader?", body: `${m.full_name} becomes the leader of ${team.name}.`, confirmLabel: "Hand over" }}>
                      Make leader
                    </ActionButton>
                    <ActionButton variant="ghost" danger action={adminRemoveMember.bind(null, id, m.user_id)} confirm={{ title: "Remove this member?", body: `${m.full_name} will be taken off ${team.name}.`, confirmLabel: "Remove" }}>
                      Remove
                    </ActionButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {requests.length > 0 && <p className="mt-3 text-sm text-ink/65">{requests.length} join request{requests.length === 1 ? "" : "s"} waiting for the leader: {requests.map((r) => r.full_name).join(", ")}.</p>}
          {canManage && (
            <div className="mt-5">
              <AdminForm action={adminAddMember.bind(null, id)} submitLabel="Add member" warnUnsaved={false}>
                <TextField name="email" label="Add a member by email" type="email" autoComplete="off" className="max-w-sm" hint="The size limit and the per-student limit still apply." />
              </AdminForm>
            </div>
          )}
        </Panel>

        {invites.length > 0 && (
          <Panel title="Invitations">
            <ul className="divide-y divide-line border border-line">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                  <span className="break-all">
                    {invite.email}
                    <span className="ml-2 capitalize text-ink/60">
                      {invite.status}
                      {invite.status === "pending" && `, expires ${formatDate(invite.expires_at)}`}
                    </span>
                  </span>
                  {canManage && invite.status === "pending" && (
                    <ActionButton variant="ghost" danger action={adminRevokeInvite.bind(null, id, invite.id)}>
                      Revoke
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {canManage && (
          <Panel title="Delete" description="Removes the team, its members list, invitations and requests. This cannot be undone.">
            <ActionButton
              danger
              action={deleteTeam.bind(null, id)}
              confirm={{ title: `Delete ${team.name}?`, body: "Type the word DELETE to confirm.", confirmLabel: "Delete team", typed: "DELETE" }}
            >
              Delete team
            </ActionButton>
          </Panel>
        )}
      </div>
    </AdminPage>
  );
}
