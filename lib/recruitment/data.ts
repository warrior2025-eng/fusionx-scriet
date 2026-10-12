import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cycleState, toQuestion, type Cycle, type Question, type RecruitmentTeam } from "./shared";

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

