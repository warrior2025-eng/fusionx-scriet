import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CoreMember } from "@/lib/data/core-teams";

export type Mentor = CoreMember & { expertise: string[]; availability: string | null; show_on_core: boolean };

/**
 * The published mentors in their order (Admin → Mentors), read through the public-safe
 * function (migration 0039). A mentor with a website account shows their own profile.
 * Both /mentors and the Core page read this list. Empty until the migration has run.
 */
export const getMentors = cache(async (): Promise<Mentor[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_mentors");
    if (error || !data) return [];
    return (data as Omit<Mentor, "is_lead">[]).map((m) => ({ ...m, is_lead: false, expertise: m.expertise ?? [] }));
  } catch {
    return [];
  }
});
