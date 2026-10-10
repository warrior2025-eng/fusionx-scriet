"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { removeByUrl } from "@/lib/admin/storage";

/**
 * Moderation of what members create: projects, research entries and project
 * teams. Editors may publish, unpublish, feature and manage teams; deleting a
 * member's project or research entry needs "moderation.delete" (admin).
 */

const uuid = z.uuid();
const WORK = {
  projects: { table: "projects", label: "Project", publicPath: "/projects" },
  research: { table: "research", label: "Research entry", publicPath: "/research" },
} as const;
type WorkKind = keyof typeof WORK;

const isWork = (kind: string): kind is WorkKind => kind === "projects" || kind === "research";

export async function setWorkPublished(kind: string, id: string, publish: boolean): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  if (!isWork(kind) || !uuid.safeParse(id).success) return fail("Unknown item.");
  const def = WORK[kind];

  const { data: before } = await ctx.supabase.from(def.table).select("id, title, is_published").eq("id", id).maybeSingle();
  if (!before) return fail(`This ${def.label.toLowerCase()} no longer exists.`);

  const { data: after, error } = await ctx.supabase
    .from(def.table)
    .update({ is_published: publish })
    .eq("id", id)
    .select("id, title, is_published")
    .maybeSingle();
  if (error || !after) return fail(`Could not update this ${def.label.toLowerCase()}.`);

  await logAudit(ctx, { action: publish ? "published" : "unpublished", table: def.table, id, before, after });
  revalidatePath(`/admin/${kind}`);
  revalidatePath(def.publicPath);
  revalidatePath("/");
  return ok(`${def.label} ${publish ? "published" : "unpublished"}.`, { viewHref: def.publicPath });
}

export async function setProjectFeatured(id: string, featured: boolean): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(id).success) return fail("Unknown project.");

  const { data: before } = await ctx.supabase.from("projects").select("id, title, is_featured").eq("id", id).maybeSingle();
  if (!before) return fail("This project no longer exists.");

  const { data: after, error } = await ctx.supabase
    .from("projects")
    .update({ is_featured: featured })
    .eq("id", id)
    .select("id, title, is_featured")
    .maybeSingle();
  if (error || !after) return fail("Could not update this project.");

  await logAudit(ctx, { action: featured ? "featured" : "unfeatured", table: "projects", id, before, after });
  revalidatePath("/admin/projects");
  revalidatePath("/");
  return ok(featured ? "Project featured on the home page." : "Project no longer featured.", { viewHref: "/" });
}

export async function deleteWork(kind: string, id: string): Promise<ActionState> {
  const ctx = await authorize("moderation.delete");
  if (!ctx) return FORBIDDEN;
  if (!isWork(kind) || !uuid.safeParse(id).success) return fail("Unknown item.");
  const def = WORK[kind];

  const { data: before } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
  if (!before) return fail(`This ${def.label.toLowerCase()} no longer exists.`);

  const { data: deleted, error } = await ctx.supabase.from(def.table).delete().eq("id", id).select("id");
  if (error || !deleted?.length) return fail(`Could not delete this ${def.label.toLowerCase()}.`);

  if (kind === "projects") await removeByUrl(ctx.supabase, "project-images", before.image_path as string | null);

  await logAudit(ctx, { action: "deleted", table: def.table, id, before, after: null });
  revalidatePath(`/admin/${kind}`);
  revalidatePath(def.publicPath);
  revalidatePath("/");
  return ok(`${def.label} deleted.`);
}

const TEAM_STATUSES = ["forming", "active", "completed", "archived"] as const;

export async function setTeamStatus(id: string, status: string): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  const parsed = z.object({ id: uuid, status: z.enum(TEAM_STATUSES) }).safeParse({ id, status });
  if (!parsed.success) return fail("Unknown team or status.");

  const { data: before } = await ctx.supabase.from("teams").select("id, name, status").eq("id", id).maybeSingle();
  if (!before) return fail("This team no longer exists.");

  const { data: after, error } = await ctx.supabase
    .from("teams")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id, name, status")
    .maybeSingle();
  if (error || !after) return fail("Could not update this team.");

  await logAudit(ctx, { action: "changed_team_status", table: "teams", id, before, after });
  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  return ok(`${before.name} is now ${parsed.data.status}.`);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(teamId).success || !uuid.safeParse(userId).success) return fail("Unknown team member.");

  const { data: removed, error } = await ctx.supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .select("role");
  if (error || !removed?.length) return fail("Could not remove this member.");

  await logAudit(ctx, {
    action: "removed_team_member",
    table: "team_members",
    id: teamId,
    before: { user_id: userId, role: removed[0].role },
    after: null,
  });
  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  return ok("Member removed from the team.");
}
