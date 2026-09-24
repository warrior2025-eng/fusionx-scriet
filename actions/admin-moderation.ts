"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isStaff, isAdmin, getCurrentUser } from "@/lib/permissions";

async function logAction(action: string, resourceType: string, resourceId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  await supabase.from("audit_logs").insert({
    user_id: user?.id,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
  });
}

export async function toggleProjectPublished(id: string, publish: boolean) {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ is_published: publish }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAction(publish ? "published_project" : "unpublished_project", "project", id);
  revalidatePath("/admin/projects");
  revalidatePath("/projects");
}

export async function deleteProjectAsAdmin(id: string) {
  if (!(await isAdmin())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAction("deleted_project", "project", id);
  revalidatePath("/admin/projects");
  revalidatePath("/projects");
}

export async function toggleEventPublished(id: string, publish: boolean) {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ is_published: publish }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAction(publish ? "published_event" : "unpublished_event", "event", id);
  revalidatePath("/admin/events");
  revalidatePath("/events");
}

export async function deleteEventAsAdmin(id: string) {
  if (!(await isAdmin())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAction("deleted_event", "event", id);
  revalidatePath("/admin/events");
  revalidatePath("/events");
}

export async function toggleOpportunityPublished(id: string, publish: boolean) {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").update({ is_published: publish }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAction(publish ? "published_opportunity" : "unpublished_opportunity", "opportunity", id);
  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
}

export async function deleteOpportunityAsAdmin(id: string) {
  if (!(await isAdmin())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAction("deleted_opportunity", "opportunity", id);
  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
}

export async function setAnnouncementStatus(id: string, status: "draft" | "published" | "archived") {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ status, published_at: status === "published" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAction(`set_announcement_${status}`, "announcement", id);
  revalidatePath("/admin/announcements");
}

export async function deleteAnnouncementAsAdmin(id: string) {
  if (!(await isAdmin())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAction("deleted_announcement", "announcement", id);
  revalidatePath("/admin/announcements");
}
