import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { addReviewer, removeReviewer } from "@/actions/admin-recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, TextField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "Admin: Recruitment reviewers" };

export default async function CycleReviewersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  const { data: teamRows } = await ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id).order("display_order");
  const teams = (teamRows ?? []) as { id: string; name: string }[];
  const { data: reviewerRows } = teams.length
    ? await ctx.supabase.from("recruitment_team_reviewers").select("team_id, user_id").in("team_id", teams.map((t) => t.id))
    : { data: [] };
  const reviewers = (reviewerRows ?? []) as { team_id: string; user_id: string }[];
  const ids = [...new Set(reviewers.map((r) => r.user_id))];
  const { data: people } = ids.length ? await ctx.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  return (
    <AdminPage
      title={`Reviewers: ${cycle.title}`}
      description="A reviewer sees only the applications that list their team, at /review. They get no other admin access."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: String(cycle.title), href: `/admin/recruitment/${id}` }, { label: "Reviewers" }]}
    >
      <CycleTabs cycleId={id} current="/reviewers" admin />
      {teams.length === 0 && <p className="text-sm text-ink/65">Add teams first.</p>}
      <div className="space-y-6">
        {teams.map((team) => {
          const own = reviewers.filter((r) => r.team_id === team.id);
          return (
            <Panel key={team.id} title={team.name}>
              {own.length > 0 ? (
                <ul className="mb-5 divide-y divide-line border border-line">
                  {own.map((r) => (
                    <li key={r.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                      {names[r.user_id] ?? "Member"}
                      <ActionButton
                        bare
                        danger
                        title={`Remove ${names[r.user_id] ?? "this reviewer"}`}
                        action={removeReviewer.bind(null, id, team.id, r.user_id)}
                        confirm={{ title: "Remove this reviewer?", body: "They lose access to this team's applications.", confirmLabel: "Remove" }}
                      >
                        <X size={15} />
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-5 text-sm text-ink/65">No reviewers yet.</p>
              )}
              <AdminForm action={addReviewer.bind(null, id, team.id)} submitLabel="Add reviewer" warnUnsaved={false}>
                <TextField name="email" label="Member's email" type="email" autoComplete="off" className="max-w-sm" />
              </AdminForm>
            </Panel>
          );
        })}
      </div>
    </AdminPage>
  );
}
