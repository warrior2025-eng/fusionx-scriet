import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteCycle, duplicateCycle, publishResults, saveCycle, setCycleStatus } from "@/actions/admin-recruitment";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm } from "@/components/admin/admin-form";
import { CycleFields, CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel, Pill, Table, Td, Th } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { CYCLE_STATUS_LABELS, STAGES, STAGE_LABELS, type Cycle } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Recruitment cycle" };

type Stats = {
  submitted: number;
  drafts: number;
  withdrawn: number;
  by_day: { day: string; count: number }[];
  by_department: { label: string; count: number }[];
  by_year: { label: string; count: number }[];
  by_team: { team_id: string; team: string; seats: number | null; stages: Record<string, number> }[];
};

/** A plain bar list: label, count, and a bar scaled to the largest count. */
function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-ink/60">Nothing yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate text-ink/80">{row.label}</span>
          <span className="h-2 bg-accent-soft">
            <span className="block h-2 bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-ink">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment.content", "/admin/recruitment");
  const admin = ctx.caps.includes("recruitment");
  const { data } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const cycle = data as Cycle;
  const { data: statsData } = await ctx.supabase.rpc("recruitment_stats", { p_cycle: id });
  const stats = (statsData ?? null) as Stats | null;

  // People selected for more than one team: worth a look before publishing.
  const { data: selectedRows } = admin
    ? await ctx.supabase.from("recruitment_team_status").select("application_id, recruitment_applications!inner(cycle_id, full_name)").eq("stage", "selected").eq("recruitment_applications.cycle_id", id)
    : { data: [] };
  const perPerson = new Map<string, { name: string; count: number }>();
  for (const row of (selectedRows ?? []) as unknown as { application_id: string; recruitment_applications: { full_name: string } }[]) {
    const entry = perPerson.get(row.application_id) ?? { name: row.recruitment_applications.full_name, count: 0 };
    entry.count++;
    perPerson.set(row.application_id, entry);
  }
  const doubles = [...perPerson.values()].filter((p) => p.count > 1);

  return (
    <AdminPage
      title={cycle.title}
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: cycle.title }]}
      actions={<Pill tone={cycle.status === "draft" ? "neutral" : cycle.status === "closed" ? "warn" : "good"}>{CYCLE_STATUS_LABELS[cycle.status]}</Pill>}
    >
      <CycleTabs cycleId={id} current="" admin={admin} />

      {admin && (
        <Panel title="Status" description="Opening shows the cycle on the site and lets students apply. Closing stops new applications at once." className="mb-6">
          <div className="flex flex-wrap gap-3">
            {cycle.status !== "open" && cycle.status !== "results_published" && (
              <ActionButton variant="primary" action={setCycleStatus.bind(null, id, "open")} confirm={{ title: "Open this cycle now?", body: "It appears on the site and students can apply until the deadline.", confirmLabel: "Open now" }}>
                Open now
              </ActionButton>
            )}
            {cycle.status === "open" && (
              <ActionButton action={setCycleStatus.bind(null, id, "closed")} confirm={{ title: "Close this cycle now?", body: "No more applications are accepted. Drafts that were not submitted stay as drafts.", confirmLabel: "Close now" }}>
                Close now
              </ActionButton>
            )}
            {(cycle.status === "open" || cycle.status === "closed") && (
              <ActionButton
                variant={cycle.status === "closed" ? "primary" : "secondary"}
                action={publishResults.bind(null, id)}
                confirm={{
                  title: "Publish results?",
                  body: `Every candidate marked Selected, Waitlisted or Not selected is told, and selected candidates can open their team's WhatsApp link. This cannot be undone.${doubles.length ? ` Note: ${doubles.length} candidate(s) are selected for more than one team.` : ""}`,
                  confirmLabel: "Publish results",
                  typed: "PUBLISH",
                }}
              >
                Publish results
              </ActionButton>
            )}
            {cycle.status === "closed" && (
              <ActionButton
                variant="ghost"
                action={setCycleStatus.bind(null, id, "draft")}
                confirm={{ title: "Put this cycle back to draft?", body: "It disappears from the site. Applications already sent are kept. A draft can be opened again, or deleted.", confirmLabel: "Back to draft" }}
              >
                Back to draft
              </ActionButton>
            )}
            <ActionButton variant="ghost" action={duplicateCycle.bind(null, id)}>
              Duplicate
            </ActionButton>
            {cycle.status === "draft" && (
              <ActionButton variant="ghost" danger action={deleteCycle.bind(null, id)} confirm={{ title: "Delete this draft?", body: "Its teams and questions are deleted too.", confirmLabel: "Delete" }}>
                Delete draft
              </ActionButton>
            )}
          </div>
          {doubles.length > 0 && (
            <p className="mt-4 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink">
              Selected for more than one team: {doubles.map((d) => d.name).join(", ")}. Decide which team each joins before publishing.
            </p>
          )}
        </Panel>
      )}

      <Panel title="Details" className="mb-6">
        <AdminForm action={saveCycle.bind(null, id)}>
          <CycleFields cycle={cycle} />
        </AdminForm>
      </Panel>

      {stats && (
        <Panel title="Numbers" description="Counted from the database. Submitted applications only, unless it says otherwise.">
          <dl className="mb-8 grid grid-cols-3 gap-3">
            {(
              [
                ["Submitted", stats.submitted],
                ["Drafts", stats.drafts],
                ["Withdrawn", stats.withdrawn],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse border border-line p-4">
                <dt className="mt-1 text-sm text-ink/65">{label}</dt>
                <dd className="font-serif text-2xl tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mb-3 text-sm font-semibold text-ink">Stage by team</h3>
          <Table label="Applications per team per stage">
            <thead>
              <tr>
                <Th>Team</Th>
                {STAGES.map((stage) => (
                  <Th key={stage}>{STAGE_LABELS[stage]}</Th>
                ))}
                <Th>Seats</Th>
              </tr>
            </thead>
            <tbody>
              {stats.by_team.map((team) => {
                const selected = team.stages.selected ?? 0;
                return (
                  <tr key={team.team_id}>
                    <Td className="font-medium text-ink">{team.team}</Td>
                    {STAGES.map((stage) => (
                      <Td key={stage} className="tabular-nums">
                        {team.stages[stage] ?? 0}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap tabular-nums">
                      {team.seats === null ? `${selected} selected` : `${selected} of ${team.seats}`}
                      {team.seats !== null && selected > team.seats && <span className="ml-2 text-red-600">over</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">Per day</h3>
              <Bars rows={stats.by_day.map((d) => ({ label: d.day, count: d.count }))} />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">By department</h3>
              <Bars rows={stats.by_department} />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">By year</h3>
              <Bars rows={stats.by_year} />
            </div>
          </div>
        </Panel>
      )}
    </AdminPage>
  );
}
