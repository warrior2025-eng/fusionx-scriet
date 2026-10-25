import { getCurrentUser } from "@/lib/permissions";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DayRoomShell } from "@/components/interview/day-room";
import { getDayAccess } from "@/lib/interview/day-access";
import { dayLabel } from "@/lib/recruitment/slots";

export const metadata: Metadata = { title: "Interview room", robots: { index: false } };

/** The day's interview room for reviewers (all hubs, or a hub with a candidate that day). The call stays connected between slots. */
export default async function ReviewerDayRoomLayout({ params, children }: { params: Promise<{ dayId: string }>; children: React.ReactNode }) {
  const { dayId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/review/interviews/day/${dayId}`);
  const access = await getDayAccess(dayId);
  if (!access) notFound();
  // A full-window app below the site header: video always in view, the sidebar scrolls on its own.
  return (
    <DayRoomShell access={access} title={`Interview room · ${dayLabel(access.day)}`}>
      {children}
    </DayRoomShell>
  );
}
