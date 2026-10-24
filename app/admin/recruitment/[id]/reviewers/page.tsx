import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { addCycleReviewers, cancelCycleReviewerInvite, removeCycleReviewer, removeReviewer } from "@/actions/admin-recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel, formatDate } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/users";

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

  // Interview reviewers for all hubs (migration 0024; an error means it has not run yet).
  const [{ data: cycleRows, error: cycleError }, { data: inviteRows }] = await Promise.all([
    ctx.supabase.from("recruitment_cycle_reviewers").select("user_id, created_at").eq("cycle_id", id).order("created_at"),
    ctx.supabase.from("recruitment_cycle_reviewer_invites").select("email, created_at").eq("cycle_id", id).order("created_at"),
  ]);
  const cycleReviewers = (cycleRows ?? []) as { user_id: string; created_at: string }[];
  const invites = (inviteRows ?? []) as { email: string; created_at: string }[];
  const onList = new Set(cycleReviewers.map((r) => r.user_id));
  const hubOnly = reviewers.filter((r) => !onList.has(r.user_id));

  const ids = [...new Set([...reviewers.map((r) => r.user_id), ...cycleReviewers.map((r) => r.user_id)])];
  const { data: people } = ids.length ? await ctx.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  // Emails live in auth.users (read with the server-only key); the list still works without them.
  let emails: Record<string, string> = {};
  if (cycleReviewers.length) {
    try {
      emails = Object.fromEntries((await listUsers(ctx)).filter((u) => ids.includes(u.id)).map((u) => [u.id, u.email]));
    } catch {
      emails = {};
    }
  }

  return (
    <AdminPage
      title={`Reviewers: ${cycle.title}`}
      description="A reviewer sees only the applications they review, at /review. They get no other admin access."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: String(cycle.title), href: `/admin/recruitment/${id}` }, { label: "Reviewers" }]}
    >
      <CycleTabs cycleId={id} current="/reviewers" admin />
      <div className="space-y-6">
        <Panel
          title="Interview reviewers (all hubs)"
          description="Reviewers can review all hubs at /review and join the interview room for this cycle. They get no other admin access."
        >
          {cycleError ? (
            <p className="text-sm text-ink/75">This list needs database migration 0024. Run it in the Supabase SQL editor, then reload this page.</p>
          ) : (
            <>
              <AdminForm action={addCycleReviewers.bind(null, id)} submitLabel="Add reviewers" warnUnsaved={false}>
                <TextareaField
                  name="emails"
                  label="Reviewer emails, one per line"
                  hint="Commas and spaces work too. Someone without an account yet gets access when they sign up with that email."
                  rows={5}
                  className="max-w-xl"
                />
              </AdminForm>

              <h3 className="mt-8 text-sm font-semibold text-ink">Reviewers ({cycleReviewers.length})</h3>
              {cycleReviewers.length > 0 ? (
                <ul className="mt-3 divide-y divide-line border border-line">
                  {cycleReviewers.map((r) => (
                    <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                      <span className="min-w-0">
                        <span className="font-medium">{names[r.user_id] ?? "Member"}</span>
                        {emails[r.user_id] && <span className="ml-2 break-all text-ink/70">{emails[r.user_id]}</span>}
                        <span className="ml-2 text-xs text-ink/60">added {formatDate(r.created_at)}</span>
                      </span>
                      <ActionButton
                        variant="ghost"
                        action={removeCycleReviewer.bind(null, id, r.user_id)}
                        confirm={{
                          title: `Remove ${names[r.user_id] ?? "this reviewer"}?`,
                          body: "They lose access to every hub's applications and to the interview room of this recruitment (also any hub they were added to one by one). Their scores and notes stay.",
                          confirmLabel: "Remove",
                        }}
                      >
                        Remove
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink/65">No interview reviewers yet.</p>
              )}

              {invites.length > 0 && (
                <>
                  <h3 className="mt-8 text-sm font-semibold text-ink">Waiting for sign-up ({invites.length})</h3>
                  <ul className="mt-3 divide-y divide-line border border-line">
                    {invites.map((inv) => (
                      <li key={inv.email} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                        <span className="min-w-0 break-all">
                          {inv.email}
                          <span className="ml-2 text-xs text-ink/60">invited {formatDate(inv.created_at)}</span>
                        </span>
                        <ActionButton variant="ghost" action={cancelCycleReviewerInvite.bind(null, id, inv.email)}>
                          Cancel invite
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Panel>

        {/* Reviewers added to a single hub earlier (before the one list above): shown so they can be removed. */}
        {hubOnly.length > 0 && (
          <Panel title="Added to one hub earlier" description="These people review only the hub named. Add them above to give them every hub, or remove them here.">
            <ul className="divide-y divide-line border border-line">
              {hubOnly.map((r) => (
                <li key={`${r.team_id}-${r.user_id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                  <span>
                    {names[r.user_id] ?? "Member"} <span className="text-ink/65">· {teams.find((t) => t.id === r.team_id)?.name ?? "Hub"}</span>
                  </span>
                  <ActionButton
                    bare
                    danger
                    title={`Remove ${names[r.user_id] ?? "this reviewer"}`}
                    action={removeReviewer.bind(null, id, r.team_id, r.user_id)}
                    confirm={{ title: "Remove this reviewer?", body: "They lose access to this hub's applications.", confirmLabel: "Remove" }}
                  >
                    <X size={15} />
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </AdminPage>
  );
}
