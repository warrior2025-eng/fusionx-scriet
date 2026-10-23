import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { PanelAccess } from "@/actions/interview-panel";
import { PanelView } from "@/components/interview/panel-view";
import { AdminPage } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getDayAccess } from "@/lib/interview/day-access";
import { slotRange } from "@/lib/recruitment/slots";

export const metadata: Metadata = { title: "Admin: Interview panel" };

export default async function InterviewSlotPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  const ctx = await requireCapability("recruitment", `/admin/interviews/${slotId}`);
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) notFound();
  const { data } = await ctx.supabase.rpc("interview_panel_access", { p_slot: slotId });
  if (!data) notFound();
  const access = data as PanelAccess;
  // A room day has one room for the whole day (migration 0024): this slot opens there.
  if (access.room_enabled && (await getDayAccess(access.day_id))) redirect(`/admin/interviews/day/${access.day_id}?slot=${slotId}`);
  return (
    <AdminPage
      title={`Interview: ${slotRange(access.starts_at, access.ends_at)}`}
      crumbs={[{ label: "Interviews", href: "/admin/interviews" }, { label: slotRange(access.starts_at, access.ends_at) }]}
    >
      <PanelView supabase={ctx.supabase} access={access} userId={ctx.user.id} />
    </AdminPage>
  );
}
