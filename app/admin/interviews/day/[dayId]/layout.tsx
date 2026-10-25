import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DayRoomShell } from "@/components/interview/day-room";
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
  // A full-window app below the admin bar: video always in view, the sidebar scrolls on its own.
  return (
    <DayRoomShell access={access} title={`Interview room · ${dayLabel(access.day)}`}>
      {children}
    </DayRoomShell>
  );
}
