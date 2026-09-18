"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, getCurrentUser } from "@/lib/permissions";
import type { InstitutionalApprovalStatus } from "@/types/database";

export type SettingsActionState = { status: "idle" | "success" | "error"; message?: string };

export async function updateOrganizationSettings(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const authorized = await isAdmin();
  if (!authorized) return { status: "error", message: "You don't have permission to do this." };

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("organization_settings")
    .update({
      chapter_name: formData.get("chapter_name")?.toString(),
      tagline: formData.get("tagline")?.toString(),
      faculty_guide_name: formData.get("faculty_guide_name")?.toString(),
      faculty_guide_title: formData.get("faculty_guide_title")?.toString(),
      institutional_approval: formData.get("institutional_approval") as InstitutionalApprovalStatus,
      official_email: formData.get("official_email")?.toString() || null,
      instagram_url: formData.get("instagram_url")?.toString() || null,
      linkedin_url: formData.get("linkedin_url")?.toString() || null,
      github_url: formData.get("github_url")?.toString() || null,
      announcement_banner: formData.get("announcement_banner")?.toString() || null,
      announcement_banner_active: formData.get("announcement_banner_active") === "on",
      updated_by: user?.id,
    })
    .eq("id", true);

  if (error) return { status: "error", message: error.message };

  await supabase.from("audit_logs").insert({
    user_id: user?.id,
    action: "updated_organization_settings",
    resource_type: "organization_settings",
    resource_id: "singleton",
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { status: "success", message: "Settings updated." };
}
