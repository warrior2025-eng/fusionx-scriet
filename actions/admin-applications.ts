"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isStaff, getCurrentUser } from "@/lib/permissions";
import type { ApplicationStatus } from "@/types/database";

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const authorized = await isStaff();
  if (!authorized) throw new Error("FORBIDDEN");

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("applications")
    .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    user_id: user?.id,
    action: "updated_application_status",
    resource_type: "application",
    resource_id: applicationId,
    metadata: { status },
  });

  revalidatePath("/admin/applications");
}
