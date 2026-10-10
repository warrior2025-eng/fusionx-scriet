"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type TeamActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const teamSchema = z.object({
  name: z.string().trim().min(3, "Name is too short").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  skills_needed: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createTeam(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const raw = {
    name: formData.get("name"),
    description: formData.get("description") || "",
    skills_needed: formData.get("skills_needed") || "",
  };

  const parsed = teamSchema.safeParse(raw);
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
  if (!user) return { status: "error", message: "Please sign in to create a team." };

  const { name, description, skills_needed } = parsed.data;

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name,
      description: description || null,
      skills_needed: skills_needed ? skills_needed.split(",").map((s) => s.trim()).filter(Boolean) : [],
      created_by: user.id,
      status: "forming",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not create the team. Please try again." };
  }

  await supabase.from("team_members").insert({ team_id: data.id, user_id: user.id, role: "lead" });

  revalidatePath("/teams");
  redirect("/teams");
}

export type TeamActionResult = { error?: string };

export async function joinTeam(teamId: string): Promise<TeamActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to join a team." };

  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, user_id: user.id, role: "member" });

  // Unique constraint on (team_id, user_id) means a duplicate join is a
  // harmless no-op from the user's point of view. Skip the notification
  // in that case too, since nothing actually changed.
  if (error) {
    // 42501: row level security refused it. Members may only add themselves
    // to a team that is still forming or active (migration 0008).
    if (error.code === "42501") return { error: "This team isn't taking new members." };
    if (error.code !== "23505") return { error: "Could not join this team. Please try again." };
  } else {
    const { data: team } = await supabase.from("teams").select("name, created_by").eq("id", teamId).single();
    if (team && team.created_by !== user.id) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      await supabase.from("notifications").insert({
        user_id: team.created_by,
        title: "New team member",
        body: `${profile?.full_name ?? "Someone"} joined your team "${team.name}".`,
        link: "/teams",
      });
    }
  }

  revalidatePath("/teams");
  return {};
}

export async function leaveTeam(teamId: string): Promise<TeamActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", user.id);

  if (error) return { error: "Could not leave this team. Please try again." };

  revalidatePath("/teams");
  return {};
}
