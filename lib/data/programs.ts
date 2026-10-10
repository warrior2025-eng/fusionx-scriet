import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { programs as shippedPrograms } from "@/lib/site-config";
import type { Program } from "@/types/database";

// The detail lists the Programs page shipped with, kept as the fallback.
const SHIPPED_DETAILS: Record<string, string[]> = {
  "build-lab": ["Ideation", "Team formation", "Technical workshops", "Build sessions", "Prototype reviews", "Demonstrations"],
  "research-forum": ["Research orientation", "Literature review", "Methodology", "Experimentation", "Documentation", "Research collaboration"],
  "ip-innovation-cell": ["Patent awareness", "Prior-art awareness", "Novelty", "Documentation", "IP education", "TCPO coordination where applicable"],
  "venture-cell": ["Problem discovery", "Customer discovery", "MVP", "Market research", "Business models", "Pitching", "Incubation/funding awareness"],
  "competition-support": ["Hackathons", "Innovation competitions", "Preparation", "Mentorship", "Submission support", "Post-competition continuation"],
  "fusionx-teams": ["Interdisciplinary collaboration", "Skill-based team formation", "Project teams", "Team coordination"],
};

const FALLBACK: Program[] = shippedPrograms.map((p, i) => ({
  id: `fallback-${p.slug}`,
  slug: p.slug,
  name: p.name,
  summary: p.summary,
  details: SHIPPED_DETAILS[p.slug] ?? [],
  icon_name: null,
  display_order: i + 1,
  is_visible: true,
}));

/**
 * Visible programs in display order. Falls back to the original six if the
 * table can't be read or is empty (before the migration has run).
 */
export const getPrograms = cache(async (): Promise<Program[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, name, summary, details, icon_name, display_order, is_visible")
      .eq("is_visible", true)
      .order("display_order", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK;
    return data as Program[];
  } catch {
    return FALLBACK;
  }
});
