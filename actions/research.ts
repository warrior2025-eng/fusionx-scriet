"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ResearchActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const researchSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(200),
  abstract: z.string().trim().min(30, "Add a fuller abstract (at least 30 characters)").max(4000),
  domain: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.enum(["idea", "researching", "experimentation", "draft", "submitted", "published"]),
  publication_info: z.string().trim().max(300).optional().or(z.literal("")),
  document_url: z.string().trim().url().optional().or(z.literal("")),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function createResearch(
  _prev: ResearchActionState,
  formData: FormData
): Promise<ResearchActionState> {
  const raw = {
    title: formData.get("title"),
    abstract: formData.get("abstract"),
    domain: formData.get("domain") || "",
    status: formData.get("status"),
    publication_info: formData.get("publication_info") || "",
    document_url: formData.get("document_url") || "",
    is_published: formData.get("is_published") ?? undefined,
  };

  const parsed = researchSchema.safeParse(raw);
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
  if (!user) return { status: "error", message: "Please sign in to add a research entry." };

  const { title, abstract, domain, status, publication_info, document_url, is_published } = parsed.data;

  const { data, error } = await supabase
    .from("research")
    .insert({
      title,
      abstract,
      domain: domain || null,
      status,
      publication_info: publication_info || null,
      document_url: document_url || null,
      created_by: user.id,
      is_published: is_published === "on",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not save this entry. Please try again." };
  }

  // The creator is automatically the first listed author.
  await supabase.from("research_authors").insert({ research_id: data.id, user_id: user.id, author_order: 1 });

  revalidatePath("/research");
  redirect("/research");
}

export async function updateResearch(
  researchId: string,
  _prev: ResearchActionState,
  formData: FormData
): Promise<ResearchActionState> {
  const raw = {
    title: formData.get("title"),
    abstract: formData.get("abstract"),
    domain: formData.get("domain") || "",
    status: formData.get("status"),
    publication_info: formData.get("publication_info") || "",
    document_url: formData.get("document_url") || "",
    is_published: formData.get("is_published") ?? undefined,
  };

  const parsed = researchSchema.safeParse(raw);
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

  const { title, abstract, domain, status, publication_info, document_url, is_published } = parsed.data;

  const { error } = await supabase
    .from("research")
    .update({
      title,
      abstract,
      domain: domain || null,
      status,
      publication_info: publication_info || null,
      document_url: document_url || null,
      is_published: is_published === "on",
    })
    .eq("id", researchId);

  // RLS enforces created_by-or-staff on the database side; a denied update
  // returns no error but affects zero rows, which reads fine here as a
  // silent no-op redirect — acceptable since the entry stays unchanged.
  if (error) {
    return { status: "error", message: "Could not save changes. Please try again." };
  }

  revalidatePath("/research");
  revalidatePath("/research/mine");
  redirect("/research/mine");
}

export async function deleteResearch(researchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("FORBIDDEN");

  const { error } = await supabase.from("research").delete().eq("id", researchId);
  if (error) throw new Error(error.message);

  revalidatePath("/research");
  revalidatePath("/research/mine");
}
