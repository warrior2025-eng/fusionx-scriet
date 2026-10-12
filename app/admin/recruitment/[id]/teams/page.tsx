import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { deleteRecruitmentTeam, moveRecruitmentTeam, saveRecruitmentTeam, setTeamWhatsapp } from "@/actions/admin-recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, Field, TextField, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel, Pill } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { RecruitmentTeam } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Recruitment teams" };

function TeamFields({ team }: { team?: RecruitmentTeam }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1fr_7rem_7rem]">
        <TextField name="name" label="Team name" defaultValue={team?.name ?? ""} maxLength={120} />
        <TextField name="emoji" label="Emoji" defaultValue={team?.emoji ?? ""} maxLength={8} />
        <TextField name="seats" label="Seats" type="number" min={0} defaultValue={team?.seats === null || team?.seats === undefined ? "" : String(team.seats)} />
      </div>
      <TextareaField name="short_description" label="Short description" rows={2} max={300} counter defaultValue={team?.short_description ?? ""} />
      <TextareaField name="responsibilities" label="What the team does" rows={4} max={2000} defaultValue={team?.responsibilities ?? ""} />
      <TextareaField name="what_we_look_for" label="What we look for" rows={4} max={2000} defaultValue={team?.what_we_look_for ?? ""} />
      <Field name="image" label={team?.image_path ? "Replace picture (optional)" : "Picture (optional)"} hint="JPEG, PNG or WebP. Needs an admin.">
        <input
          id="image"
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-ink/30 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
      </Field>
      {team?.image_path && <CheckboxField name="image__remove" label="Remove the current picture" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <CheckboxField name="is_visible" label="Visible on the site" defaultChecked={team?.is_visible ?? true} />
        <CheckboxField name="accepting_applications" label="Taking applications" defaultChecked={team?.accepting_applications ?? true} />
      </div>
    </>
  );
}

export default async function CycleTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment.content", "/admin/recruitment");
  const admin = ctx.caps.includes("recruitment");
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  const [{ data: teamRows }, { data: linkRows }] = await Promise.all([
    ctx.supabase.from("recruitment_teams").select("*").eq("cycle_id", id).order("display_order").order("created_at"),
    // Admins only; an editor gets no rows.
    admin ? ctx.supabase.from("recruitment_team_links").select("team_id, whatsapp_group_url") : Promise.resolve({ data: [] }),
  ]);
  const teams = (teamRows ?? []) as RecruitmentTeam[];
  const links = Object.fromEntries((linkRows ?? []).map((l) => [l.team_id as string, l.whatsapp_group_url as string]));

  return (
    <AdminPage title={`Teams: ${cycle.title}`} crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: String(cycle.title), href: `/admin/recruitment/${id}` }, { label: "Teams" }]}>
      <CycleTabs cycleId={id} current="/teams" admin={admin} />

      <div className="space-y-4">
        {teams.length === 0 && <p className="text-sm text-ink/65">No teams yet. Add the first one below.</p>}
        {teams.map((team, i) => (
          <details key={team.id} className="border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="font-medium text-ink">
                {team.emoji ? `${team.emoji} ` : ""}
                {team.name}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {!team.is_visible && <Pill>Hidden</Pill>}
                {!team.accepting_applications && <Pill tone="warn">Not taking applications</Pill>}
                {admin && (links[team.id] ? <Pill tone="good">WhatsApp link set</Pill> : <Pill tone="warn">No WhatsApp link</Pill>)}
                <ActionButton bare title={`Move ${team.name} up`} disabled={i === 0} action={moveRecruitmentTeam.bind(null, id, team.id, -1)}>
                  <ArrowUp size={15} />
                </ActionButton>
                <ActionButton bare title={`Move ${team.name} down`} disabled={i === teams.length - 1} action={moveRecruitmentTeam.bind(null, id, team.id, 1)}>
                  <ArrowDown size={15} />
                </ActionButton>
              </span>
            </summary>
            <div className="space-y-8 border-t border-line p-5">
              <AdminForm action={saveRecruitmentTeam.bind(null, id, team.id)}>
                <TeamFields team={team} />
              </AdminForm>
              {admin && (
                <div className="border-t border-line pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-ink">WhatsApp group link (private)</h3>
                  <AdminForm action={setTeamWhatsapp.bind(null, id, team.id)} submitLabel="Save link" warnUnsaved={false}>
                    <TextField
                      name="whatsapp_group_url"
                      label="Group invite link"
                      type="url"
                      placeholder="https://chat.whatsapp.com/…"
                      defaultValue={links[team.id] ?? ""}
                      hint="Never shown on the site. Only candidates selected for this team see it, after results are published. Clear it to remove."
                    />
                  </AdminForm>
                  <div className="mt-6">
                    <ActionButton
                      variant="ghost"
                      danger
                      action={deleteRecruitmentTeam.bind(null, id, team.id)}
                      confirm={{ title: `Delete ${team.name}?`, body: "Its own questions are deleted too. A team with applications cannot be deleted.", confirmLabel: "Delete" }}
                    >
                      Delete team
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      <Panel title="Add a team" className="mt-8">
        <AdminForm action={saveRecruitmentTeam.bind(null, id, null)} submitLabel="Add team">
          <TeamFields />
        </AdminForm>
      </Panel>
    </AdminPage>
  );
}
