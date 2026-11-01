import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OfficialCompare, type OfficialList } from "@/components/admin/official-compare";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { Cycle } from "@/lib/recruitment/data";
import { resultsVisible } from "@/lib/recruitment/results";
import { isFinal, loadBoard } from "@/lib/recruitment/results-admin";
import type { CompareCandidate } from "@/lib/recruitment/official-compare";

export const metadata: Metadata = { title: "Admin: Compare with official list" };

/** Super admins only, once results are out. The database checks both again. */
export default async function CompareResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/results`);
  if (!ctx.roles.includes("super_admin")) redirect(`/admin/recruitment/${id}/results`);
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!cycle) notFound();
  if (!resultsVisible(cycle as Cycle)) redirect(`/admin/recruitment/${id}/results`);

  const [{ teams, rows }, { data: lists }] = await Promise.all([loadBoard(ctx.supabase, id), ctx.supabase.from("recruitment_official_lists").select("id, name, hubs").order("name")]);
  const people = new Map<string, CompareCandidate>();
  for (const r of rows) {
    const person = people.get(r.application_id) ?? { application_id: r.application_id, name: r.name, detail: [r.department, r.year].filter(Boolean).join(", "), decisions: {} };
    person.decisions[r.team_id] = isFinal(r.stage) ? r.stage : "undecided";
    people.set(r.application_id, person);
  }
  const candidates = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AdminPage
      title="Compare with official list"
      description="Names per hub, matched to candidates. Nothing changes until you confirm the list of changes."
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: (cycle as Cycle).title, href: `/admin/recruitment/${id}` },
        { label: "Results", href: `/admin/recruitment/${id}/results` },
        { label: "Compare" },
      ]}
    >
      <Panel>
        <OfficialCompare cycleId={id} teams={teams.map((t) => ({ id: t.id, name: t.name }))} candidates={candidates} lists={(lists ?? []) as OfficialList[]} />
      </Panel>
    </AdminPage>
  );
}
