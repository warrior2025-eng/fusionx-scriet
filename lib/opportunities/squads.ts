import type { SupabaseClient } from "@supabase/supabase-js";

/** Squad Match (migration 0047): which opportunities can have squads, and how many are forming or going. */
export type SquadCount = { forming: number; going: number };

export const squadable = (o: { category?: string | null; team_mode?: string | null }) =>
  ["hackathon", "competition", "ideathon", "innovation_challenge"].includes(o.category ?? "") && o.team_mode !== "solo";

export async function squadCounts(supabase: SupabaseClient, ids: string[]): Promise<Record<string, SquadCount>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc("ap_squad_counts", { p_ids: ids });
  if (error || !data) return {}; // before migration 0047
  return Object.fromEntries((data as { opportunity_id: string; forming: number; going: number }[]).map((r) => [r.opportunity_id, { forming: r.forming, going: r.going }]));
}
