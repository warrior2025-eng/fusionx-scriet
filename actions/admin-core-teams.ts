"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN, type AdminContext } from "@/lib/admin/guard";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { friendlyDbError } from "@/lib/recruitment/shared";

/**
 * The core teams, from the admin panel (Core → Teams). An admin only picks
 * existing users and gives them a title; the card shows what they wrote on
 * their own profile.
 */

const uuid = z.string().uuid();
const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "team";

function touched() {
  // Notifications written by this action also go out as email, after the response.
  deliverEmailsAfterResponse();
  revalidatePath("/admin/team");
  revalidatePath("/core");
  revalidatePath("/");
}

/** Renumbers a list 1..n after swapping one row with its neighbour. */
async function swapAndSave(ctx: AdminContext, table: string, list: { id: string; display_order: number }[], id: string, direction: "up" | "down") {
  const from = list.findIndex((row) => row.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) return false;
  [list[from], list[to]] = [list[to], list[from]];
  for (let i = 0; i < list.length; i++) {
    if (list[i].display_order !== i + 1) {
      const { error } = await ctx.supabase.from(table).update({ display_order: i + 1 }).eq("id", list[i].id);
      if (error) throw new Error(error.message);
    }
  }
  return true;
}

// ── teams ────────────────────────────────────────────────────────────────

const groupSchema = z.object({
  name: z.string().trim().min(2, "Give the team a name").max(80, "Keep the name under 80 characters"),
  description: z.string().trim().max(300, "Keep the description under 300 characters"),
});

/** Creates a custom team (no id), or changes a team's name and description. */
export async function saveCoreGroup(groupId: string | null, input: { name: string; description: string }): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const values = { name: parsed.data.name, description: parsed.data.description || null };

  if (!groupId) {
    const { data: last } = await ctx.supabase.from("core_groups").select("display_order").order("display_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await ctx.supabase
      .from("core_groups")
      .insert({ ...values, slug: slugify(values.name), kind: "custom", display_order: (last?.display_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error?.code === "23505") return fail("A team with this name already exists.");
    if (error || !data) return fail("Could not create the team.");
    await logAudit(ctx, { action: "created", table: "core_groups", id: data.id, before: null, after: values });
    touched();
    return ok("Team created.");
  }

  if (!uuid.safeParse(groupId).success) return fail("Team not found.");
  const { data: before } = await ctx.supabase.from("core_groups").select("name, description").eq("id", groupId).maybeSingle();
  if (!before) return fail("Team not found.");
  const { error } = await ctx.supabase.from("core_groups").update(values).eq("id", groupId);
  if (error?.code === "23505") return fail("A team with this name already exists.");
  if (error) return fail("Could not save the team.");
  await logAudit(ctx, { action: "updated", table: "core_groups", id: groupId, before, after: values });
  touched();
  return ok("Team saved.", { viewHref: "/core" });
}

export async function setCoreGroupVisible(groupId: string, visible: boolean): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(groupId).success) return fail("Team not found.");
  const { data, error } = await ctx.supabase.from("core_groups").update({ is_visible: visible }).eq("id", groupId).select("name");
  if (error || !data?.length) return fail("Could not change this team.");
  await logAudit(ctx, { action: visible ? "shown" : "hidden", table: "core_groups", id: groupId, note: data[0].name });
  touched();
  return ok(visible ? "Team shown on the website." : "Team hidden from the website.");
}

export async function moveCoreGroup(groupId: string, direction: "up" | "down"): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const { data } = await ctx.supabase.from("core_groups").select("id, display_order").order("display_order").order("created_at");
  try {
    if (!(await swapAndSave(ctx, "core_groups", data ?? [], groupId, direction))) return ok("Already at the edge of the list.");
  } catch {
    return fail("Could not save the new order.");
  }
  await logAudit(ctx, { action: "reordered", table: "core_groups", id: groupId, note: direction });
  touched();
  return ok("Order saved.");
}

/** Only a custom team can go. The database refuses the seeded five too. */
export async function deleteCoreGroup(groupId: string): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(groupId).success) return fail("Team not found.");
  const { data: before } = await ctx.supabase.from("core_groups").select("name, kind").eq("id", groupId).maybeSingle();
  if (!before) return fail("Team not found.");
  if (before.kind !== "custom") return fail("This team can be hidden, not deleted.");
  const { data: gone, error } = await ctx.supabase.from("core_groups").delete().eq("id", groupId).select("id");
  if (error || !gone?.length) return fail("Could not delete the team.");
  await logAudit(ctx, { action: "deleted", table: "core_groups", id: groupId, before, after: null });
  touched();
  return ok("Team deleted.");
}

// ── finding and adding people ────────────────────────────────────────────

export type CoreUserHit = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department: string | null;
  year: string | null;
  already_added: boolean;
};

export async function searchCoreUsers(groupId: string, q: string): Promise<{ results: CoreUserHit[]; error?: string }> {
  const ctx = await authorize("team");
  if (!ctx) return { results: [], error: FORBIDDEN.message };
  if (!uuid.safeParse(groupId).success) return { results: [], error: "Team not found." };
  const { data, error } = await ctx.supabase.rpc("admin_search_core_users", { p_group: groupId, p_q: q.slice(0, 100) });
  if (error) return { results: [], error: "The search did not work. Please try again." };
  return { results: (data ?? []) as CoreUserHit[] };
}

export type CoreCandidate = {
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  year: string | null;
  offer_status: string | null;
};

export async function listCoreCandidates(groupId: string): Promise<{ results: CoreCandidate[]; error?: string }> {
  const ctx = await authorize("team");
  if (!ctx) return { results: [], error: FORBIDDEN.message };
  if (!uuid.safeParse(groupId).success) return { results: [], error: "Team not found." };
  const { data, error } = await ctx.supabase.rpc("core_recruitment_candidates", { p_group: groupId });
  if (error) return { results: [], error: "The list could not be loaded. Please try again." };
  return { results: (data ?? []) as CoreCandidate[] };
}

const addSchema = z.object({
  groupId: uuid,
  userIds: z.array(uuid).min(1, "Choose at least one person").max(50, "Add at most 50 people at a time"),
  title: z.string().trim().max(80, "Keep the title under 80 characters"),
});

/** The database adds them, tells each one once and writes the audit entries. */
export async function addCoreMembers(groupId: string, userIds: string[], title: string): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const parsed = addSchema.safeParse({ groupId, userIds, title });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { data, error } = await ctx.supabase.rpc("core_add_members", { p_group: groupId, p_users: parsed.data.userIds, p_title: parsed.data.title || "Member" });
  if (error) return fail(friendlyDbError(error.message, "Could not add them."));
  touched();
  const added = (data as { added: number }).added;
  if (added === 0) return fail("Nobody was added. They are already in this team.");
  return ok(added === 1 ? "Added. They have been told." : `${added} people added. They have been told.`, { viewHref: "/core" });
}

// ── one member ───────────────────────────────────────────────────────────

/** The member's row and name, for the checks and the audit note. */
async function memberOf(ctx: AdminContext, memberId: string) {
  if (!uuid.safeParse(memberId).success) return null;
  const { data } = await ctx.supabase
    .from("core_group_members")
    .select("id, group_id, user_id, title, is_lead, is_visible, profiles(full_name)")
    .eq("id", memberId)
    .maybeSingle();
  if (!data) return null;
  const person = data.profiles as unknown as { full_name: string } | null;
  return { ...data, name: person?.full_name ?? "" };
}

export async function setCoreMemberTitle(memberId: string, title: string): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const parsed = z.string().trim().min(1, "Give them a title").max(80, "Keep the title under 80 characters").safeParse(title);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the title.");
  const member = await memberOf(ctx, memberId);
  if (!member) return fail("This member is no longer in the team.");
  const { error } = await ctx.supabase.from("core_group_members").update({ title: parsed.data }).eq("id", memberId);
  if (error) return fail("Could not save the title.");
  await logAudit(ctx, { action: "changed_core_title", table: "core_group_members", id: memberId, before: { title: member.title }, after: { title: parsed.data }, note: member.name });
  touched();
  return ok("Title saved.");
}

export async function setCoreMemberLead(memberId: string, lead: boolean): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const member = await memberOf(ctx, memberId);
  if (!member) return fail("This member is no longer in the team.");
  const { error } = await ctx.supabase.from("core_group_members").update({ is_lead: lead }).eq("id", memberId);
  if (error) return fail("Could not change this.");
  await logAudit(ctx, { action: lead ? "set_core_lead" : "unset_core_lead", table: "core_group_members", id: memberId, note: member.name });
  touched();
  return ok(lead ? `${member.name} is now a lead.` : `${member.name} is no longer a lead.`);
}

export async function setCoreMemberVisible(memberId: string, visible: boolean): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const member = await memberOf(ctx, memberId);
  if (!member) return fail("This member is no longer in the team.");
  const { error } = await ctx.supabase.from("core_group_members").update({ is_visible: visible }).eq("id", memberId);
  if (error) return fail("Could not change this.");
  await logAudit(ctx, { action: visible ? "shown" : "hidden", table: "core_group_members", id: memberId, note: member.name });
  touched();
  return ok(visible ? `${member.name} is shown in this team.` : `${member.name} is hidden from this team.`);
}

/** Leads stay above everyone else, as on the public page, so a member moves among their own kind. */
export async function moveCoreMember(memberId: string, direction: "up" | "down"): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const member = await memberOf(ctx, memberId);
  if (!member) return fail("This member is no longer in the team.");
  const { data } = await ctx.supabase
    .from("core_group_members")
    .select("id, display_order")
    .eq("group_id", member.group_id)
    .eq("is_lead", member.is_lead)
    .order("display_order")
    .order("created_at");
  try {
    if (!(await swapAndSave(ctx, "core_group_members", data ?? [], memberId, direction))) return ok("Already at the edge of the list.");
  } catch {
    return fail("Could not save the new order.");
  }
  await logAudit(ctx, { action: "reordered", table: "core_group_members", id: memberId, note: member.name });
  touched();
  return ok("Order saved.");
}

export async function removeCoreMember(memberId: string): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  const member = await memberOf(ctx, memberId);
  if (!member) return fail("This member is no longer in the team.");
  const { data: gone, error } = await ctx.supabase.from("core_group_members").delete().eq("id", memberId).select("id");
  if (error || !gone?.length) return fail("Could not remove them.");
  await logAudit(ctx, { action: "removed_core_member", table: "core_group_members", id: memberId, before: { title: member.title }, after: null, note: member.name });
  touched();
  return ok(`${member.name} removed from this team.`);
}

/** One member (userId) or everyone incomplete in the team. The database holds the 24 hour limit. */
export async function remindCoreMembers(groupId: string, userId: string | null): Promise<ActionState> {
  const ctx = await authorize("team");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(groupId).success || (userId && !uuid.safeParse(userId).success)) return fail("Team not found.");
  const { data, error } = await ctx.supabase.rpc("core_remind_members", { p_group: groupId, p_user: userId });
  if (error) return fail(friendlyDbError(error.message, "Could not send the reminder."));
  touched();
  const { sent, skipped } = data as { sent: number; skipped: number };
  if (sent === 0) return fail(skipped > 0 ? "Already reminded in the last 24 hours." : "Nobody here has an incomplete profile.");
  const also = skipped > 0 ? ` ${skipped} already reminded in the last 24 hours.` : "";
  return ok(`${sent === 1 ? "Reminder sent." : `${sent} reminders sent.`}${also}`);
}
