import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cycleState, toQuestion, type Cycle, type Question, type RecruitmentTeam } from "./shared";
import type { MyResult, PublicResults } from "./results";
import type { MeetLinkState, MyBooking, SlotAvailability } from "./slots";

/**
 * Recruitment: the reads behind the public pages. Every read here returns
 * "nothing" instead of throwing, so a page still renders if the tables are
 * not there yet. The shapes and pure helpers live in ./shared and are
 * re-exported, so server code can keep importing everything from here.
 */
export * from "./shared";

/**
 * The cycle the public pages are about: the one that is open, or else the
 * most recent one that is not a draft. Null when there is none.
 */
export const getCurrentCycle = cache(async (): Promise<Cycle | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("recruitment_cycles")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error || !data?.length) return null;
    const cycles = data as Cycle[];
    return cycles.find((c) => cycleState(c) === "open") ?? cycles.find((c) => c.status === "open") ?? cycles[0];
  } catch {
    return null;
  }
});

export async function getVisibleTeams(cycleId: string): Promise<RecruitmentTeam[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruitment_teams")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("is_visible", true)
    .order("display_order")
    .order("name");
  return (data ?? []) as RecruitmentTeam[];
}

export async function getQuestions(cycleId: string): Promise<Question[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruitment_questions")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("display_order")
    .order("created_at");
  return (data ?? []).map((row) => toQuestion(row as Record<string, unknown>));
}


/** The cycle's interview slots with seat counts (empty before migration 0016, or when there are none). */
export async function getSlotAvailability(cycleId: string): Promise<SlotAvailability[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruitment_slot_availability", { p_cycle: cycleId });
  return error ? [] : ((data ?? []) as SlotAvailability[]);
}

/** The signed-in person's booking in this cycle, or null. */
export async function getMyBooking(cycleId: string): Promise<MyBooking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_slot_booking", { p_cycle: cycleId });
  return error || !data ? null : (data as MyBooking);
}

/**
 * The signed-in person's result. Before the publish time the database returns
 * only "pending" and the date. (Empty before migration 0017.)
 */
export async function getMyResult(cycleId: string): Promise<MyResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_result", { p_cycle: cycleId });
  return error || !data ? { state: "none" } : (data as MyResult);
}

/** The public Selected and Waitlist lists, or "pending" with the date before the publish time. */
export async function getPublicResults(cycleId: string): Promise<PublicResults> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_results", { p_cycle: cycleId });
  return error || !data ? { state: "none" } : (data as PublicResults);
}

/** Where the signed-in person's Meet link stands; the url only when it may be shown. */
export async function getMyMeetLink(cycleId: string): Promise<MeetLinkState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_meet_link", { p_cycle: cycleId });
  return error || !data ? { state: "none" } : (data as MeetLinkState);
}
