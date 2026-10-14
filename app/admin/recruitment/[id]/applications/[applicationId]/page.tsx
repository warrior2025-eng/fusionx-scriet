import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage } from "@/components/admin/ui";
import { ApplicationView } from "@/components/recruitment/application-view";
import { requireCapability } from "@/lib/admin/guard";
import type { Cycle } from "@/lib/recruitment/data";
import { loadApplicationDetail } from "@/lib/recruitment/detail";
import { resultsVisible } from "@/lib/recruitment/results";

export const metadata: Metadata = { title: "Admin: Application" };

export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string; applicationId: string }> }) {
  const { id, applicationId } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const detail = await loadApplicationDetail(ctx.supabase, applicationId);
  if (!detail || detail.application.cycle_id !== id) notFound();
  const name = detail.application.full_name ?? "Applicant";
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  const locked = cycle?.decisions_locked === true || resultsVisible(cycle as Cycle | null);

  return (
    <AdminPage
      title={name}
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: "Applications", href: `/admin/recruitment/${id}/applications` },
        { label: name },
      ]}
    >
      <CycleTabs cycleId={id} current="/applications" admin />
      <ApplicationView supabase={ctx.supabase} userId={ctx.user.id} locked={locked} {...detail} />
    </AdminPage>
  );
}
