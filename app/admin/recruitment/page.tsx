import type { Metadata } from "next";
import Link from "next/link";
import { saveCycle } from "@/actions/admin-recruitment";
import { AdminForm } from "@/components/admin/admin-form";
import { CycleFields } from "@/components/admin/recruitment-parts";
import { RecruitmentSiteControls } from "@/components/admin/site-controls";
import { AdminPage, EmptyRow, Panel, Pill, Table, Td, Th, formatDate } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { CYCLE_STATUS_LABELS, type Cycle } from "@/lib/recruitment/data";

export const metadata: Metadata = { title: "Admin: Recruitment" };

const TONE = { draft: "neutral", open: "good", closed: "warn", results_published: "good" } as const;

export default async function RecruitmentAdminPage() {
  const ctx = await requireCapability("recruitment.content", "/admin/recruitment");
  const { data } = await ctx.supabase.from("recruitment_cycles").select("*").order("created_at", { ascending: false });
  const cycles = (data ?? []) as Cycle[];

  return (
    <AdminPage
      title="Recruitment"
      description="Each cycle has its own teams, questions, reviewers and applications. A cycle starts as a draft; nothing shows on the site until an admin opens it."
      crumbs={[{ label: "Recruitment" }]}
      actions={
        <LinkButton href="/admin/recruitment/templates" variant="secondary" size="sm">
          Message templates
        </LinkButton>
      }
    >
      <Table label="Recruitment cycles">
        <thead>
          <tr>
            <Th>Cycle</Th>
            <Th>Status</Th>
            <Th>Opens</Th>
            <Th>Deadline</Th>
          </tr>
        </thead>
        <tbody>
          {cycles.length === 0 && <EmptyRow colSpan={4}>No cycles yet. Create the first one below.</EmptyRow>}
          {cycles.map((cycle) => (
            <tr key={cycle.id}>
              <Td className="font-medium text-ink">
                <Link href={`/admin/recruitment/${cycle.id}`} className="underline underline-offset-2">
                  {cycle.title}
                </Link>
              </Td>
              <Td>
                <Pill tone={TONE[cycle.status]}>{CYCLE_STATUS_LABELS[cycle.status]}</Pill>
              </Td>
              <Td className="whitespace-nowrap">{formatDate(cycle.opens_at, true)}</Td>
              <Td className="whitespace-nowrap">{formatDate(cycle.closes_at, true)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Panel title="New cycle" description="Created as a draft. Add the teams and questions, then open it." className="mt-8">
        <AdminForm action={saveCycle.bind(null, null)} submitLabel="Create draft">
          <CycleFields />
        </AdminForm>
      </Panel>

      <RecruitmentSiteControls canSettings={ctx.caps.includes("settings")} />
    </AdminPage>
  );
}
