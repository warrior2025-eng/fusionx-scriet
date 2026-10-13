"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { friendlyDbError } from "@/lib/recruitment/data";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * FusionX Teams, from the admin panel.
 *
 *  - "moderation" (editors and up): a team's name, status and the staff note.
 *  - "teams.manage" (admins): verifying, featuring, deleting, members,
 *    invites, the focus list, the limits and the WhatsApp link.
 */

const uuid = z.string().uuid();
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

function touched(teamId?: string) {
  // Notifications written by this action also go out as email, after the response.
  deliverEmailsAfterResponse();
  revalidatePath("/teams");
  revalidatePath("/admin/teams");
  if (teamId) {
    revalidatePath(`/teams/${teamId}`);
    revalidatePath(`/admin/teams/${teamId}`);
  }
}

/** Verifies or rejects a team (or puts it back to pending). The leader is told, with the note. */
export async function verifyTeam(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("teams.manage");
  if (!ctx) return FORBIDDEN;
  const parsed = z
    .object({ decision: z.enum(["verified", "rejected", "pending"], { message: "Choose a decision" }), note: z.string().max(500) })
    .safeParse({ decision: text(formData, "decision"), note: text(formData, "note") });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  if (!uuid.safeParse(teamId).success) return fail("Team not found.");
  // The database function checks the role again, tells the leader and writes the audit entry.
  const { error } = await ctx.supabase.rpc("verify_team", { p_team: teamId, p_status: parsed.data.decision, p_note: parsed.data.note || null });
  if (error) return fail(friendlyDbError(error.message, "Could not update the verification."));
  touched(teamId);
  return ok(parsed.data.decision === "verified" ? "Team verified. Its leader has been told." : parsed.data.decision === "rejected" ? "Team rejected. Its leader has been told." : "Back to pending.", {
    viewHref: `/teams/${teamId}`,
  });
}

export async function saveTeamAdmin(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  const parsed = z
    .object({ name: z.string().min(3, "The name is too short").max(120), status: z.enum(["forming", "active", "completed", "archived"]) })
    .safeParse({ name: text(formData, "name"), status: text(formData, "status") });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { data: before } = await ctx.supabase.from("teams").select("id, name, status, is_featured").eq("id", teamId).maybeSingle();
  if (!before) return fail("Team not found.");
  // Featuring is an admin's call; an editor's save leaves it as it was.
  const values = { ...parsed.data, ...(ctx.caps.includes("teams.manage") ? { is_featured: formData.get("is_featured") === "on" } : {}) };
  const { error } = await ctx.supabase.from("teams").update(values).eq("id", teamId);
  if (error) return fail("Could not save the team.");
  await logAudit(ctx, { action: "updated", table: "teams", id: teamId, before, after: values });
  touched(teamId);
  return ok("Saved.", { viewHref: `/teams/${teamId}` });
}

export async function saveTeamNote(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("moderation");
  if (!ctx) return FORBIDDEN;
  const note = text(formData, "note");
  if (note.length > 2000) return fail("Please fix the highlighted fields.", { note: "Keep this under 2000 characters" });
  const { error } = note
    ? await ctx.supabase.from("team_admin_notes").upsert({ team_id: teamId, note, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: "team_id" })
    : await ctx.supabase.from("team_admin_notes").delete().eq("team_id", teamId);
  if (error) return fail("Could not save the note.");
  await logAudit(ctx, { action: "updated_note", table: "teams", id: teamId });
  revalidatePath(`/admin/teams/${teamId}`);
  return ok("Note saved.");
}

/** Runs one of the team functions as staff and writes the audit entry. */
async function staffCall(fn: string, args: Record<string, unknown>, teamId: string, action: string, done: string, note?: string): Promise<ActionState> {
  const ctx = await authorize("teams.manage");
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.rpc(fn, args);
  if (error) return fail(friendlyDbError(error.message, "That could not be done."));
  await logAudit(ctx, { action, table: "teams", id: teamId, note });
  touched(teamId);
  return ok(done);
}

export async function adminAddMember(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(text(formData, "email").toLowerCase());
  if (!email.success) return fail("Please fix the highlighted fields.", { email: "Enter the member's email address." });
  return staffCall("admin_add_team_member", { p_team: teamId, p_email: email.data }, teamId, "added_member", "Member added.");
}

export async function adminRemoveMember(teamId: string, userId: string): Promise<ActionState> {
  return staffCall("remove_member", { p_team: teamId, p_user: userId }, teamId, "removed_member", "Member removed.", userId);
}

export async function adminTransferLeadership(teamId: string, userId: string): Promise<ActionState> {
  return staffCall("transfer_leadership", { p_team: teamId, p_user: userId }, teamId, "transferred_leadership", "Leadership handed over.", userId);
}

export async function adminRevokeInvite(teamId: string, inviteId: string): Promise<ActionState> {
  return staffCall("revoke_team_invite", { p_invite: inviteId }, teamId, "revoked_invite", "Invitation withdrawn.");
}

export async function deleteTeam(teamId: string): Promise<ActionState> {
  const ctx = await authorize("teams.manage");
  if (!ctx) return FORBIDDEN;
  const { data: before } = await ctx.supabase.from("teams").select("id, name, status, verification_status").eq("id", teamId).maybeSingle();
  if (!before) return fail("Team not found.");
  const { data: gone, error } = await ctx.supabase.from("teams").delete().eq("id", teamId).select("id");
  if (error || !gone?.length) return fail("Could not delete the team.");
  await logAudit(ctx, { action: "deleted", table: "teams", id: teamId, before, after: null });
  touched();
  return ok("Team deleted.", { redirectTo: "/admin/teams" });
}

/**
 * The focus list, one name per line, in order. A name taken off the list is
 * hidden rather than deleted, because teams that already use it keep it.
 */
export async function saveFocusCategories(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("teams.manage");
  if (!ctx) return FORBIDDEN;
  const names = [...new Set(text(formData, "names").split(/\n+/).map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return fail("Please fix the highlighted fields.", { names: "Add at least one focus" });
  if (names.length > 20) return fail("Please fix the highlighted fields.", { names: "At most 20" });
  if (names.some((n) => n.length > 60)) return fail("Please fix the highlighted fields.", { names: "Keep each name under 60 characters" });

  const { data: existing } = await ctx.supabase.from("team_focus_categories").select("id, name");
  const { error } = await ctx.supabase
    .from("team_focus_categories")
    .upsert(names.map((name, i) => ({ name, display_order: i + 1, is_visible: true })), { onConflict: "name" });
  if (error) return fail("Could not save the list.");
  const dropped = (existing ?? []).filter((c) => !names.includes(c.name as string)).map((c) => c.id as string);
  if (dropped.length) await ctx.supabase.from("team_focus_categories").update({ is_visible: false }).in("id", dropped);
  await logAudit(ctx, { action: "updated", table: "team_focus_categories", after: { names } });
  touched();
  revalidatePath("/teams/register");
  return ok("Focus list saved.", { viewHref: "/teams/register" });
}

/** The FusionX Teams WhatsApp group link. Empty removes it. Never written to the audit log. */
export async function saveTeamsWhatsapp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("teams.manage");
  if (!ctx) return FORBIDDEN;
  const url = text(formData, "url");
  if (url && !/^https:\/\/\S{6,300}$/i.test(url)) return fail("Please fix the highlighted fields.", { url: "Use a full https:// link" });
  const { error } = url
    ? await ctx.supabase.from("private_links").upsert({ key: "fusionx_teams_whatsapp", url, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" })
    : await ctx.supabase.from("private_links").delete().eq("key", "fusionx_teams_whatsapp");
  if (error) return fail("Could not save the link.");
  await logAudit(ctx, { action: url ? "set_whatsapp_link" : "removed_whatsapp_link", table: "private_links", id: "fusionx_teams_whatsapp" });
  revalidatePath("/admin/teams/settings");
  return ok(url ? "Link saved. Only members of verified teams will see it." : "Link removed.");
}
