"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  year: z.string().trim().max(20).optional().or(z.literal("")),
  bio: z.string().trim().max(600).optional().or(z.literal("")),
  skills: z.string().trim().max(300).optional().or(z.literal("")),
  interests: z.string().trim().max(300).optional().or(z.literal("")),
  portfolio_url: z.string().trim().url().optional().or(z.literal("")),
  github_url: z.string().trim().url().optional().or(z.literal("")),
  linkedin_url: z.string().trim().url().optional().or(z.literal("")),
  is_profile_public: z.union([z.literal("on"), z.undefined()]).optional(),
  is_contact_public: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function updateProfile(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const raw = {
    full_name: formData.get("full_name"),
    department: formData.get("department") || "",
    year: formData.get("year") || "",
    bio: formData.get("bio") || "",
    skills: formData.get("skills") || "",
    interests: formData.get("interests") || "",
    portfolio_url: formData.get("portfolio_url") || "",
    github_url: formData.get("github_url") || "",
    linkedin_url: formData.get("linkedin_url") || "",
    is_profile_public: formData.get("is_profile_public") ?? undefined,
    is_contact_public: formData.get("is_contact_public") ?? undefined,
  };

  const parsed = profileSchema.safeParse(raw);
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

  const {
    full_name,
    department,
    year,
    bio,
    skills,
    interests,
    portfolio_url,
    github_url,
    linkedin_url,
    is_profile_public,
    is_contact_public,
  } = parsed.data;

  // Avatar upload — optional. Path is prefixed with the user's own id, which
  // is what the storage RLS policy checks against.
  let avatarUrl: string | undefined;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.includes(avatarFile.type)) {
      return { status: "error", message: "Avatar must be a JPEG, PNG, or WEBP file." };
    }
    if (avatarFile.size > MAX_IMAGE_BYTES) {
      return { status: "error", message: "Avatar must be under 2MB." };
    }
    const ext = avatarFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
    if (uploadError) {
      return { status: "error", message: "Could not upload the avatar. Please try again." };
    }
    // Cache-bust so the new avatar shows immediately instead of a stale
    // cached copy at the same URL.
    avatarUrl = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      department: department || null,
      year: year || null,
      bio: bio || null,
      skills: skills ? skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      interests: interests ? interests.split(",").map((s) => s.trim()).filter(Boolean) : [],
      portfolio_url: portfolio_url || null,
      github_url: github_url || null,
      linkedin_url: linkedin_url || null,
      is_profile_public: is_profile_public === "on",
      is_contact_public: is_contact_public === "on",
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: "Could not save your profile. Please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile updated." };
}
