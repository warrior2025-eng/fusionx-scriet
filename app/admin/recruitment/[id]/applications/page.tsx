import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { bulkStage } from "@/actions/admin-recruitment";
import { AdminForm, SelectField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { SelectAll } from "@/components/admin/select-all";
import { AdminPage, EmptyRow, Pill, Table, Td, Th, Toolbar, formatDate, param, withParams, type ListParams } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { distinct, filterApplications, loadCycleApplications } from "@/lib/recruitment/admin";
import { STAGES, STAGE_LABELS, STAGE_TONE } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Recruitment applications" };

export default async function CycleApplicationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ListParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  const base = `/admin/recruitment/${id}/applications`;

  const [{ data: teamRows }, all] = await Promise.all([
    ctx.supabase.from("recruitment_teams").select("id, name, seats").eq("cycle_id", id).order("display_order"),
    loadCycleApplications(ctx.supabase, id),
  ]);
  const teams = (teamRows ?? []) as { id: string; name: string; seats: number | null }[];
  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? "Team";
  const filters = {
    q: param(query, "q"),
    team: param(query, "team"),
    rank: param(query, "rank"),
    stage: param(query, "stage"),
    department: param(query, "department"),
    year: param(query, "year"),
    score: param(query, "score"),
  };
  const shown = filterApplications(all, filters);
  const doubles = new Set(all.filter((a) => a.teams.filter((t) => t.stage === "selected").length > 1).map((a) => a.id));

  return (
    <AdminPage
      title={`Applications: ${cycle.title}`}
      description={`${all.length} submitted. Tick applications to move them to a stage for one team. Final results reach candidates only when you publish them on the Overview tab.`}
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: String(cycle.title), href: `/admin/recruitment/${id}` }, { label: "Applications" }]}
      actions={
        filters.team ? (
          <>
            <LinkButton href={withParams(`${base}/export`, query, {})} variant="secondary" size="sm">
              <Download size={14} /> Export this team (CSV)
            </LinkButton>
            <LinkButton href={withParams(`${base}/export`, query, { notes: 1 })} variant="ghost" size="sm">
              With private notes
            </LinkButton>
          </>
        ) : undefined
      }
    >
      <CycleTabs cycleId={id} current="/applications" admin />

      <Toolbar
        base={base}
        params={query}
        searchPlaceholder="Search name, department, year"
        filters={[
          { name: "team", label: "Team", options: teams.map((t) => ({ value: t.id, label: t.name })) },
          { name: "rank", label: "Preference", options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: `Choice ${n}` })) },
          { name: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })) },
          { name: "department", label: "Department", options: distinct(all.map((a) => a.department)).map((d) => ({ value: d, label: d })) },
          { name: "year", label: "Year", options: distinct(all.map((a) => a.year)).map((y) => ({ value: y, label: y })) },
          { name: "score", label: "Average score", options: [2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} or more` })) },
        ]}
      />
      {!filters.team && <p className="mb-4 text-sm text-ink/65">Choose a team in the filter to export its applications as CSV.</p>}

      <AdminForm action={bulkStage.bind(null, id)} submitLabel="Move selected" warnUnsaved={false}>
        <Table label="Applications">
          <thead>
            <tr>
              <Th className="w-10">
                <SelectAll name="ids" label="Select all applications shown" />
              </Th>
              <Th>Name</Th>
              <Th>Department</Th>
              <Th>Year</Th>
              <Th>Teams, stage and score</Th>
              <Th>Submitted</Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <EmptyRow colSpan={6}>{all.length === 0 ? "No applications have been submitted yet." : "No application matches these filters."}</EmptyRow>}
            {shown.map((application) => (
              <tr key={application.id}>
                <Td>
                  <input type="checkbox" name="ids" value={application.id} aria-label={`Select ${application.full_name}`} className="h-4 w-4 accent-[var(--color-accent)]" />
                </Td>
                <Td className="font-medium text-ink">
                  <Link href={`${base}/${application.id}`} className="underline underline-offset-2">
                    {application.full_name}
                  </Link>
                  {doubles.has(application.id) && (
                    <span className="mt-1 block">
                      <Pill tone="warn">Selected twice</Pill>
                    </span>
                  )}
                </Td>
                <Td>{application.department}</Td>
                <Td>{application.year}</Td>
                <Td>
                  <ul className="space-y-1">
                    {application.teams.map((t) => (
                      <li key={t.team_id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="tabular-nums text-ink/60">{t.rank}.</span>
                        <span className="text-ink">{teamName(t.team_id)}</span>
                        <Pill tone={STAGE_TONE[t.stage]}>{STAGE_LABELS[t.stage]}</Pill>
                        {t.average !== null && (
                          <span className="tabular-nums text-ink/70">
                            {t.average.toFixed(1)} ({t.reviews})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td className="whitespace-nowrap">{formatDate(application.submitted_at, true)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* A stage always belongs to one team: no empty choice. The team in the filter, else the first. */}
          <SelectField
            name="bulk_team"
            label="For team"
            defaultValue={teams.some((t) => t.id === filters.team) ? filters.team : (teams[0]?.id ?? "")}
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
          />
          <SelectField
            name="bulk_stage"
            label="Move to stage"
            options={[{ value: "", label: "Choose a stage" }, ...STAGES.filter((s) => s !== "interview").map((s) => ({ value: s, label: STAGE_LABELS[s] }))]}
            hint="Interviews are scheduled one by one, from the application's own page."
          />
        </div>
      </AdminForm>
    </AdminPage>
  );
}
