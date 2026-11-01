import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MyAction, Pass, PassOwner } from "./shared";

export type MyMeetings = { now: string; me: PassOwner | null; passes: Pass[]; past: Pass[]; actions: MyAction[] };

/** The signed-in person's passes, past meetings and action items. */
export async function getMyMeetings(): Promise<MyMeetings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_meeting_passes");
  if (error || !data) return { now: new Date().toISOString(), me: null, passes: [], past: [], actions: [] };
  return data as MyMeetings;
}

export type MeetingSignal = {
  now: string;
  has_upcoming: boolean;
  soon: { id: string; title: string; phase: "doors" | "live" } | null;
  ring: { id: string; meeting_id: string; title: string; host: string } | null;
};

/** For the header. Null before the migration has been run, so the site carries on without it. */
export const getMeetingSignal = cache(async (): Promise<MeetingSignal | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_meeting_signal");
    return error ? null : (data as MeetingSignal);
  } catch {
    return null;
  }
});
