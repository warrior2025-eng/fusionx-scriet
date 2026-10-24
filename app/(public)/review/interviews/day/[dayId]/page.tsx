import { getCurrentUser } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { DaySidebar } from "@/components/interview/day-sidebar";
import { getDayAccess } from "@/lib/interview/day-access";
import { createClient } from "@/lib/supabase/server";

/** The day room's sidebar for a reviewer: the current slot's candidates of their hubs (all hubs for interview reviewers). */
export default async function ReviewerDayRoomPage({ params, searchParams }: { params: Promise<{ dayId: string }>; searchParams: Promise<{ slot?: string }> }) {
  const [{ dayId }, { slot }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/review/interviews/day/${dayId}`);
  const access = await getDayAccess(dayId);
  if (!access) notFound();
  return <DaySidebar supabase={supabase} access={access} userId={user.id} base={`/review/interviews/day/${dayId}`} pinned={slot} />;
}
