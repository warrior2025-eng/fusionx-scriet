import { cache } from "react";
import type { DayAccess } from "@/lib/interview/shared";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in person's access to an interview day (interview_day_access,
 * migration 0024), or null. Asked once per request: the day room's layout and
 * page share it.
 */
export const getDayAccess = cache(async (dayId: string): Promise<DayAccess | null> => {
  if (!UUID.test(dayId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("interview_day_access", { p_day: dayId });
  return error || !data ? null : (data as DayAccess);
});
