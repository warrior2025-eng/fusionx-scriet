import { notFound } from "next/navigation";
import { DaySidebar } from "@/components/interview/day-sidebar";
import { requireCapability } from "@/lib/admin/guard";
import { getDayAccess } from "@/lib/interview/day-access";

/** The day room's sidebar: the current slot (or the one picked with ?slot=). */
export default async function DayRoomPage({ params, searchParams }: { params: Promise<{ dayId: string }>; searchParams: Promise<{ slot?: string }> }) {
  const [{ dayId }, { slot }] = await Promise.all([params, searchParams]);
  const ctx = await requireCapability("recruitment", `/admin/interviews/day/${dayId}`);
  const access = await getDayAccess(dayId);
  if (!access) notFound();
  return <DaySidebar supabase={ctx.supabase} access={access} userId={ctx.user.id} base={`/admin/interviews/day/${dayId}`} pinned={slot} />;
}
