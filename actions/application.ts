"use server";

import { createClient } from "@/lib/supabase/server";
import { joinApplicationSchema } from "@/lib/validations";
import { getOrganizationSettings } from "@/lib/data/organization";

export type ApplicationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitApplication(
  _prev: ApplicationActionState,
  formData: FormData
): Promise<ApplicationActionState> {
  const raw = {
    full_name: formData.get("full_name"),
    college_email: formData.get("college_email"),
    department: formData.get("department"),
    year: formData.get("year"),
    skills: formData.getAll("skills"),
    interests: formData.getAll("interests"),
    portfolio_url: formData.get("portfolio_url") || "",
    github_url: formData.get("github_url") || "",
    linkedin_url: formData.get("linkedin_url") || "",
    preferred_functional_area: formData.get("preferred_functional_area"),
    project_interests: formData.get("project_interests") || "",
    research_interests: formData.get("research_interests") || "",
    motivation: formData.get("motivation"),
    website: formData.get("website") || "", // honeypot
  };

  // Also enforced by a trigger on the applications table.
  if (!(await getOrganizationSettings()).join_open) {
    return { status: "error", message: "Applications are currently closed." };
  }

  const parsed = joinApplicationSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "Please sign in before submitting an application, so we can follow up with you.",
    };
  }

  const { website: _honeypot, ...data } = parsed.data;

  const { error } = await supabase.from("applications").insert({
    ...data,
    user_id: user.id,
  });

  if (error) {
    // Unique index on (lower(college_email)) for open applications catches duplicates.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "An application with this email is already under review.",
      };
    }
    return { status: "error", message: "Something went wrong submitting your application. Please try again." };
  }

  return { status: "success", message: "Application submitted. We'll review it and follow up by email." };
}
