"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, tagList } from "@/lib/validation/profile";

export type ProfileActionState = {
  /** partial: the text was saved and the photo was not. */
  status: "idle" | "success" | "partial" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  signedOut?: boolean;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

function imageKind(b: Uint8Array): { type: string; ext: string } | null {
  const text = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && text(1, 4) === "PNG") return { type: "image/png", ext: "png" };
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function touched() {
  revalidatePath("/profile");
  revalidatePath("/core");
  revalidatePath("/", "layout");
}

const savedAt = () =>
  new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();

export async function updateProfile(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(Object.keys(profileSchema.shape).map((name) => [name, field(formData, name)])));
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
  if (!user) return { status: "error", message: "You were signed out. Sign in again; your changes are kept.", signedOut: true };

  const { full_name, department, year, bio, skills, interests, portfolio_url, github_url, linkedin_url } = parsed.data;

  // Admins decide these three for a Core member. Not knowing yet is the same as not changing them.
  const { data: teams, error: teamsError } = await supabase.rpc("my_core_teams");
  const visibility =
    teamsError || (teams?.length ?? 0) > 0
      ? {}
      : {
          is_profile_public: formData.get("is_profile_public") === "on",
          is_contact_public: formData.get("is_contact_public") === "on",
          show_on_core: formData.get("show_on_core") === "on",
        };

  // The words first, so that a photo that fails can't cost anyone what they wrote.
  const { data: saved, error } = await supabase
    .from("profiles")
    .update({
      full_name,
      department: department || null,
      year: year || null,
      bio: bio || null,
      skills: tagList(skills),
      interests: tagList(interests),
      portfolio_url: portfolio_url || null,
      github_url: github_url || null,
      linkedin_url: linkedin_url || null,
      ...visibility,
    })
    .eq("id", user.id)
    .select("id");

  if (error) return { status: "error", message: "Couldn't save your profile. Please try again." };
  if (!saved || saved.length === 0) return { status: "error", message: "Your profile wasn't saved: no changes reached it. Reload the page and try again." };

  const problem = await savePhoto(supabase, user.id, formData);
  touched();
  if (problem) return { status: "partial", message: `Your profile was saved, but the photo couldn't be uploaded: ${problem} Choose the file again.` };
  return { status: "success", message: `Profile saved at ${savedAt()}` };
}

/** Optional. The path starts with the user's own id, which the storage policy checks. Returns what went wrong. */
async function savePhoto(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, formData: FormData): Promise<string | null> {
  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return "Photo is larger than 2 MB.";
    // The browser's word for the type and the file's name are not trusted: what
    // is stored, and how it is served, follows the file's first bytes.
    const kind = imageKind(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if (!kind) return "This file isn't an image.";
    const path = `${userId}/avatar.${kind.ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { contentType: kind.type, upsert: true });
    if (uploadError) return "Couldn't upload the photo, please try again.";
    // Cache-bust so the new photo shows immediately instead of a stale copy at the same URL.
    const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    return error ? "Couldn't upload the photo, please try again." : null;
  }

  // "Remove the current image": the photo leaves the profile, and any file of
  // theirs leaves storage so the old address stops working.
  if (formData.get("avatar__remove") === "on") {
    const { data: files } = await supabase.storage.from("avatars").list(userId);
    if (files?.length) await supabase.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    return error ? "Couldn't remove the photo, please try again." : null;
  }
  return null;
}
