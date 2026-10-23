import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DayRoomShell } from "@/components/interview/day-room";
import { AdminPage } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getDayAccess } from "@/lib/interview/day-access";
import { dayLabel } from "@/lib/recruitment/slots";

export const metadata: Metadata = { title: "Admin: Interview room" };

/** The day's interview room for admins. The call lives here, so it stays connected while the sidebar (the page) moves between slots. */
export default async function DayRoomLayout({ params, children }: { params: Promise<{ dayId: string }>; children: React.ReactNode }) {
  const { dayId } = await params;
  await requireCapability("recruitment", `/admin/interviews/day/${dayId}`);
  const access = await getDayAccess(dayId);
  if (!access) notFound();
  return (
    <AdminPage
      title={`Interview room: ${dayLabel(access.day, "long")}`}
      description="One room for the whole day. The panel stays in it; each slot's candidates are let in for their slot and removed when it ends."
      crumbs={[{ label: "Interviews", href: "/admin/interviews" }, { label: dayLabel(access.day) }]}
    >
      <DayRoomShell access={access}>{children}</DayRoomShell>
    </AdminPage>
  );
}
