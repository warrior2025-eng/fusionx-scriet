import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage } from "@/components/admin/ui";
import { ApplicationView } from "@/components/recruitment/application-view";
import { requireCapability } from "@/lib/admin/guard";
import { loadApplicationDetail } from "@/lib/recruitment/detail";

export const metadata: Metadata = { title: "Admin: Application" };

export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string; applicationId: string }> }) {
  const { id, applicationId } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const detail = await loadApplicationDetail(ctx.supabase, applicationId);
  if (!detail || detail.application.cycle_id !== id) notFound();
  const name = detail.application.full_name ?? "Applicant";

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
      <ApplicationView supabase={ctx.supabase} userId={ctx.user.id} {...detail} />
    </AdminPage>
  );
}
