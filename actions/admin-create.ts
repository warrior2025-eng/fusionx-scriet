"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStaff, getCurrentUser } from "@/lib/permissions";

export type CreateActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(200),
  description: z.string().trim().min(10, "Add a description").max(3000),
  event_date: z.string().trim().min(1, "Pick a date"),
  event_time: z.string().trim().optional().or(z.literal("")),
  venue: z.string().trim().max(200).optional().or(z.literal("")),
  organizer: z.string().trim().max(200).optional().or(z.literal("")),
  registration_url: z.string().trim().url().optional().or(z.literal("")),
  registration_capacity: z.string().trim().optional().or(z.literal("")),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function createEvent(
  _prev: CreateActionState,
  formData: FormData
): Promise<CreateActionState> {
  const authorized = await isStaff();
  if (!authorized) return { status: "error", message: "You don't have permission to do this." };

  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    event_date: formData.get("event_date"),
    event_time: formData.get("event_time") || "",
    venue: formData.get("venue") || "",
    organizer: formData.get("organizer") || "",
    registration_url: formData.get("registration_url") || "",
    registration_capacity: formData.get("registration_capacity") || "",
    is_published: formData.get("is_published") ?? undefined,
  };

  const parsed = eventSchema.safeParse(raw);
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
  const {
    title,
    description,
    event_date,
    event_time,
    venue,
    organizer,
    registration_url,
    registration_capacity,
    is_published,
  } = parsed.data;

  // Poster upload — staff-only bucket, so any error here is surfaced
  // directly rather than silently dropping the poster.
  let posterPath: string | null = null;
  const posterFile = formData.get("poster") as File | null;
  if (posterFile && posterFile.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.includes(posterFile.type)) {
      return { status: "error", message: "Poster must be a JPEG, PNG, or WEBP file." };
    }
    if (posterFile.size > MAX_IMAGE_BYTES) {
      return { status: "error", message: "Poster must be under 4MB." };
    }
    const ext = posterFile.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("event-posters")
      .upload(path, posterFile, { contentType: posterFile.type });
    if (uploadError) {
      return { status: "error", message: "Could not upload the poster. Please try again." };
    }
    posterPath = supabase.storage.from("event-posters").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("events").insert({
    title,
    description,
    event_date,
    event_time: event_time || null,
    venue: venue || null,
    organizer: organizer || null,
    registration_url: registration_url || null,
    registration_capacity: registration_capacity ? Number(registration_capacity) : null,
    poster_path: posterPath,
    created_by: user?.id,
    is_published: is_published === "on",
  });

  if (error) {
    return { status: "error", message: "Could not create the event. Please try again." };
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect("/admin/events");
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

const opportunitySchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(200),
  organizer: z.string().trim().min(2, "Add an organizer").max(200),
  category: z.enum([
    "hackathon",
    "competition",
    "research",
    "internship",
    "workshop",
    "scholarship",
    "conference",
    "innovation_challenge",
  ]),
  description: z.string().trim().min(10, "Add a description").max(3000),
  eligibility: z.string().trim().max(500).optional().or(z.literal("")),
  deadline: z.string().trim().optional().or(z.literal("")),
  registration_url: z.string().trim().url().optional().or(z.literal("")),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function createOpportunity(
  _prev: CreateActionState,
  formData: FormData
): Promise<CreateActionState> {
  const authorized = await isStaff();
  if (!authorized) return { status: "error", message: "You don't have permission to do this." };

  const raw = {
    title: formData.get("title"),
    organizer: formData.get("organizer"),
    category: formData.get("category"),
    description: formData.get("description"),
    eligibility: formData.get("eligibility") || "",
    deadline: formData.get("deadline") || "",
    registration_url: formData.get("registration_url") || "",
    is_published: formData.get("is_published") ?? undefined,
  };

  const parsed = opportunitySchema.safeParse(raw);
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
  const { title, organizer, category, description, eligibility, deadline, registration_url, is_published } =
    parsed.data;

  const { error } = await supabase.from("opportunities").insert({
    title,
    organizer,
    category,
    description,
    eligibility: eligibility || null,
    deadline: deadline || null,
    registration_url: registration_url || null,
    status: "open",
    created_by: user?.id,
    is_published: is_published === "on",
  });

  if (error) {
    return { status: "error", message: "Could not create the opportunity. Please try again." };
  }

  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
  redirect("/admin/opportunities");
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(200),
  content: z.string().trim().min(10, "Add some content").max(3000),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  publish_now: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function createAnnouncement(
  _prev: CreateActionState,
  formData: FormData
): Promise<CreateActionState> {
  const authorized = await isStaff();
  if (!authorized) return { status: "error", message: "You don't have permission to do this." };

  const raw = {
    title: formData.get("title"),
    content: formData.get("content"),
    category: formData.get("category") || "",
    publish_now: formData.get("publish_now") ?? undefined,
  };

  const parsed = announcementSchema.safeParse(raw);
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
  const { title, content, category, publish_now } = parsed.data;
  const publishing = publish_now === "on";

  const { error } = await supabase.from("announcements").insert({
    title,
    content,
    category: category || null,
    author_id: user?.id,
    status: publishing ? "published" : "draft",
    published_at: publishing ? new Date().toISOString() : null,
  });

  if (error) {
    return { status: "error", message: "Could not create the announcement. Please try again." };
  }

  revalidatePath("/admin/announcements");
  redirect("/admin/announcements");
}
