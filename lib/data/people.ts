import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings } from "@/lib/data/organization";
import { additionalFacultyGuides, founders, seniorMentor } from "@/lib/site-config";
import type { OrgPerson, OrgPersonCategory } from "@/types/database";

export const PERSON_CATEGORIES: { value: OrgPersonCategory; label: string; plural: string }[] = [
  { value: "founder", label: "Founder", plural: "Founding team" },
  { value: "faculty_guide", label: "Faculty guide", plural: "Faculty guides" },
  { value: "senior_mentor", label: "Senior mentor", plural: "Senior mentors" },
  { value: "core_team", label: "Core team", plural: "Core team" },
  { value: "advisor", label: "Advisor", plural: "Advisors" },
];

function person(
  category: OrgPersonCategory,
  order: number,
  full_name: string,
  role_title: string,
  about: string | null = null,
): OrgPerson {
  return {
    id: `fallback-${category}-${order}`,
    full_name,
    role_title,
    category,
    about,
    photo_path: null,
    email: null,
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    display_order: order,
    is_visible: true,
    linked_profile_id: null,
    created_at: "",
    updated_at: "",
  };
}

/** The people the site listed before they moved into the database. */
async function fallbackPeople(): Promise<OrgPerson[]> {
  const settings = await getOrganizationSettings();
  return [
    ...founders.map((f, i) => person("founder", i + 1, f.name, f.role, f.responsibilities)),
    person("faculty_guide", 1, settings.faculty_guide_name, settings.faculty_guide_title),
    ...additionalFacultyGuides.map((f, i) => person("faculty_guide", i + 2, f.name, f.title)),
    person("senior_mentor", 1, seniorMentor.name, seniorMentor.role),
  ];
}

/**
 * The organization's visible people, in display order. Falls back to the
 * original hard-coded list if the table can't be read or has no rows at all
 * (i.e. before the migration has run), so the Team page is never empty.
 */
export const getPeople = cache(async (): Promise<OrgPerson[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("org_people")
      .select("*")
      .eq("is_visible", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return fallbackPeople();
    return data as OrgPerson[];
  } catch {
    return fallbackPeople();
  }
});

export function peopleIn(people: OrgPerson[], category: OrgPersonCategory): OrgPerson[] {
  return people.filter((p) => p.category === category);
}
