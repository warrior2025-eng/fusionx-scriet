import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { lockDecisions } from "@/actions/admin-results";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, Panel, Pill } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import type { Cycle } from "@/lib/recruitment/data";
import { resultsVisible } from "@/lib/recruitment/results";
import { isFinal, loadBoard, type BoardRow } from "@/lib/recruitment/results-admin";

export const metadata: Metadata = { title: "Admin: Review before locking" };

const NAMES = (rows: BoardRow[]) => rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));

/** Everything that will be locked, per hub. Locking stores this as the snapshot publishing is checked against. */
export default async function ReviewLockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/results`);
  const base = `/admin/recruitment/${id}/results`;
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  if ((cycle as Cycle).decisions_locked || resultsVisible(cycle as Cycle)) redirect(base);
  const { teams, rows } = await loadBoard(ctx.supabase, id);

  const selectedIn = new Map<string, string[]>();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  for (const r of rows) if (r.stage === "selected") selectedIn.set(r.name, [...(selectedIn.get(r.name) ?? []), teamName.get(r.team_id) ?? ""]);
  const twoHubs = [...selectedIn].filter(([, hubs]) => hubs.length > 1);
  // Locking applies the absent rule: these change as it happens.
  const absent = rows.filter((r) => r.attendance === "no_show");
  const willChange = absent.filter((r) => !(r.stage === "not_selected" && r.reason === "absent") && r.reason !== "override");
  const absentPeople = [...new Set(absent.map((r) => r.name))].sort((a, b) => a.localeCompare(b));

  return (
    <AdminPage
      title="Review before locking"
      description="Check every hub. Once locked, the database refuses any change until an admin unlocks with a reason."
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: (cycle as Cycle).title, href: `/admin/recruitment/${id}` },
        { label: "Results", href: base },
        { label: "Review before locking" },
      ]}
    >
      <div className="space-y-6">
        <Panel title="Across hubs">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div data-review="two-hubs">
              <dt className="font-medium text-ink">In two hubs ({twoHubs.length})</dt>
              <dd className="mt-1 text-ink/75">{twoHubs.length ? twoHubs.map(([name, hubs]) => `${name}: ${hubs.join(", ")}`).join("; ") : "Nobody"}</dd>
            </div>
            <div data-review="absent">
              <dt className="font-medium text-ink">Absent ({absentPeople.length})</dt>
              <dd className="mt-1 text-ink/75">{absentPeople.length ? absentPeople.join(", ") : "Nobody"}</dd>
            </div>
          </dl>
          {willChange.length > 0 && (
            <p className="mt-4 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink" data-review="will-change">
              Locking sets these to Not selected because they were absent: {willChange.map((r) => `${r.name} (${teamName.get(r.team_id)})`).join(", ")}.
            </p>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          {teams.map((team) => {
            const mine = rows.filter((r) => r.team_id === team.id);
            const groups = [
              ["Selected", "good", mine.filter((r) => r.stage === "selected")],
              ["Waitlisted", "warn", mine.filter((r) => r.stage === "waitlisted")],
              ["Not selected", "neutral", mine.filter((r) => r.stage === "not_selected")],
              ["Not decided", "bad", mine.filter((r) => !isFinal(r.stage))],
            ] as const;
            return (
              <Panel key={team.id} title={team.name}>
                <dl className="space-y-3 text-sm" data-review-hub={team.name}>
                  {groups.map(([label, tone, people]) => (
                    <div key={label}>
                      <dt className="flex items-center gap-2 font-medium text-ink">
                        <Pill tone={tone}>{people.length}</Pill> {label}
                      </dt>
                      {people.length > 0 && <dd className="mt-1 text-ink/75">{NAMES([...people]).join(", ")}</dd>}
                    </div>
                  ))}
                </dl>
              </Panel>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            variant="primary"
            action={lockDecisions.bind(null, id)}
            confirm={{
              title: "Lock these decisions?",
              body: "This is what will be published. Only an admin can unlock, with a reason.",
              confirmLabel: "Lock decisions",
            }}
          >
            Confirm and lock
          </ActionButton>
          <LinkButton href={base} variant="ghost" size="sm">
            Back to the board
          </LinkButton>
        </div>
      </div>
    </AdminPage>
  );
}
