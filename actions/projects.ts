"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/permissions";
import type { ProjectStatus } from "@/types/database";

export type ProjectActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const projectSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(160),
  description: z.string().trim().min(20, "Add a fuller description (at least 20 characters)").max(4000),
  domain: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.enum(["idea", "building", "prototype", "testing", "completed", "continued"]),
  technologies: z.string().trim().max(300).optional().or(z.literal("")),
  github_url: z.string().trim().url().optional().or(z.literal("")),
  demo_url: z.string().trim().url().optional().or(z.literal("")),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

function parseFields(formData: FormData) {
  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    domain: formData.get("domain") || "",
    status: formData.get("status"),
    technologies: formData.get("technologies") || "",
    github_url: formData.get("github_url") || "",
    demo_url: formData.get("demo_url") || "",
    is_published: formData.get("is_published") ?? undefined,
  };
  return projectSchema.safeParse(raw);
}

/**
 * Uploads the project image to Storage under the owner's own folder (the
 * bucket's RLS policy only allows writes under `${user.id}/...`) and
 * returns its public URL. Returns null if no file was submitted, and
 * throws a plain Error with a user-facing message on validation failure
 * so callers can surface it directly.
 */
async function uploadProjectImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File | null
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Image must be a JPEG, PNG, or WEBP file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 4MB.");
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("project-images").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Could not upload the image. Please try again.");

  const { data } = supabase.storage.from("project-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function createProject(
  _prev: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const parsed = parseFields(formData);
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
  if (!user) return { status: "error", message: "Please sign in to create a project." };

  const { title, description, domain, status, technologies, github_url, demo_url, is_published } =
    parsed.data;

  let imagePath: string | null = null;
  try {
    imagePath = await uploadProjectImage(supabase, user.id, formData.get("image") as File | null);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Image upload failed." };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      slug: slugify(title),
      description,
      domain: domain || null,
      status: status as ProjectStatus,
      technologies: technologies
        ? technologies.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      github_url: github_url || null,
      demo_url: demo_url || null,
      image_path: imagePath,
      owner_id: user.id,
      is_published: is_published === "on",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not create the project. Please try again." };
  }

  revalidatePath("/projects");
  redirect("/projects/mine");
}

export async function updateProject(
  projectId: string,
  _prev: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const parsed = parseFields(formData);
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
  if (!user) return { status: "error", message: "Please sign in." };

  const staff = await isStaff();
  const { title, description, domain, status, technologies, github_url, demo_url, is_published } =
    parsed.data;

  // RLS also enforces owner-or-staff on the database side — this check just
  // gives a clean error message instead of a generic RLS failure.
  const { data: existing } = await supabase
    .from("projects")
    .select("owner_id, image_path")
    .eq("id", projectId)
    .single();

  if (!existing || (existing.owner_id !== user.id && !staff)) {
    return { status: "error", message: "You don't have permission to edit this project." };
  }

  let imagePath = existing.image_path as string | null;
  try {
    const uploaded = await uploadProjectImage(supabase, user.id, formData.get("image") as File | null);
    if (uploaded) imagePath = uploaded;
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Image upload failed." };
  }

  const { error } = await supabase
    .from("projects")
    .update({
      title,
      description,
      domain: domain || null,
      status: status as ProjectStatus,
      technologies: technologies
        ? technologies.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      github_url: github_url || null,
      demo_url: demo_url || null,
      image_path: imagePath,
      is_published: is_published === "on",
    })
    .eq("id", projectId);

  if (error) {
    return { status: "error", message: "Could not save changes. Please try again." };
  }

  revalidatePath("/projects");
  revalidatePath("/projects/mine");
  redirect("/projects/mine");
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("FORBIDDEN");

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  revalidatePath("/projects/mine");
}
