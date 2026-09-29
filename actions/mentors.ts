"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStaff, getCurrentUser } from "@/lib/permissions";

export type MentorActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const mentorSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  role_title: z.string().trim().min(2, "Add a role or title").max(160),
  expertise: z.string().trim().max(300).optional().or(z.literal("")),
  experience: z.string().trim().max(300).optional().or(z.literal("")),
  linkedin_url: z.string().trim().url().optional().or(z.literal("")),
  availability: z.string().trim().max(200).optional().or(z.literal("")),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function createMentor(
  _prev: MentorActionState,
  formData: FormData
): Promise<MentorActionState> {
  const authorized = await isStaff();
  if (!authorized) return { status: "error", message: "You don't have permission to do this." };

  const raw = {
    name: formData.get("name"),
    role_title: formData.get("role_title"),
    expertise: formData.get("expertise") || "",
    experience: formData.get("experience") || "",
    linkedin_url: formData.get("linkedin_url") || "",
    availability: formData.get("availability") || "",
    bio: formData.get("bio") || "",
    is_published: formData.get("is_published") ?? undefined,
  };

  const parsed = mentorSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const user = await getCurrentUser();
  const supabase = await createClient();
  const { name, role_title, expertise, experience, linkedin_url, availability, bio, is_published } =
    parsed.data;

  const { error } = await supabase.from("mentors").insert({
    name,
    role_title,
    expertise: expertise ? expertise.split(",").map((s) => s.trim()).filter(Boolean) : [],
    experience: experience || null,
    linkedin_url: linkedin_url || null,
    availability: availability || null,
    bio: bio || null,
    created_by: user?.id,
    is_published: is_published === "on",
  });

  if (error) {
    return { status: "error", message: "Could not save this mentor. Please try again." };
  }

  revalidatePath("/mentors");
  revalidatePath("/admin/mentors");
  redirect("/admin/mentors");
}

export async function toggleMentorPublished(id: string, publish: boolean) {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("mentors").update({ is_published: publish }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/mentors");
  revalidatePath("/mentors");
}

export async function deleteMentor(id: string) {
  if (!(await isStaff())) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { error } = await supabase.from("mentors").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/mentors");
  revalidatePath("/mentors");
}
