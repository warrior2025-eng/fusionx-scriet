"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isStaff, getCurrentUser } from "@/lib/permissions";
import type { ApplicationStatus } from "@/types/database";

const STATUS_MESSAGES: Record<ApplicationStatus, string> = {
  submitted: "Your application was received.",
  under_review: "Your application is now under review.",
  shortlisted: "You've been shortlisted! We'll be in touch about next steps.",
  selected: "Congratulations — you've been selected to join FusionX!",
  rejected: "Your application wasn't selected this time.",
  archived: "Your application has been archived.",
};

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const authorized = await isStaff();
  if (!authorized) throw new Error("FORBIDDEN");

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: application, error } = await supabase
    .from("applications")
    .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select("user_id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    user_id: user?.id,
    action: "updated_application_status",
    resource_type: "application",
    resource_id: applicationId,
    metadata: { status },
  });

  // Let the applicant know — this is what actually makes /notifications
  // useful rather than a permanently empty page.
  if (application?.user_id) {
    await supabase.from("notifications").insert({
      user_id: application.user_id,
      title: "Application update",
      body: STATUS_MESSAGES[status],
      link: "/join",
    });
  }

  revalidatePath("/admin/applications");
}
