"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { createAdminClient } from "@/lib/supabase/server";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";
import type { AppRole } from "@/types/database";

const uuid = z.uuid();
const roleSchema = z.enum(ALL_ROLES as [AppRole, ...AppRole[]]);

/** Postgres raises the safeguards' messages as plain exceptions (code P0001). */
const guardMessage = (error: { code?: string; message: string }, fallback: string) =>
  error.code === "P0001" ? error.message : fallback;

function revalidateUser(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function grantRole(userId: string, role: string): Promise<ActionState> {
  const ctx = await authorize("roles");
  if (!ctx) return FORBIDDEN;
  const parsed = z.object({ userId: uuid, role: roleSchema }).safeParse({ userId, role });
  if (!parsed.success) return fail("That role can't be granted.");

  const { error } = await ctx.supabase
    .from("user_roles")
    .insert({ user_id: parsed.data.userId, role: parsed.data.role, granted_by: ctx.user.id });
  if (error) {
    if (error.code === "23505") return ok("They already have that role.");
    return fail(guardMessage(error, "Could not grant the role."));
  }

  await logAudit(ctx, {
    action: "granted_role",
    table: "user_roles",
    id: parsed.data.userId,
    before: null,
    after: { role: parsed.data.role },
  });
  revalidateUser(parsed.data.userId);
  return ok(`${ROLE_LABELS[parsed.data.role]} role granted.`);
}

export async function revokeRole(userId: string, role: string): Promise<ActionState> {
  const ctx = await authorize("roles");
  if (!ctx) return FORBIDDEN;
  const parsed = z.object({ userId: uuid, role: roleSchema }).safeParse({ userId, role });
  if (!parsed.success) return fail("That role can't be revoked.");

  // Stated here for a clear message; the database enforces both rules itself.
  if (parsed.data.role === "super_admin" && parsed.data.userId === ctx.user.id) {
    return fail("You can't remove your own super admin role.");
  }

  const { data: removed, error } = await ctx.supabase
    .from("user_roles")
    .delete()
    .eq("user_id", parsed.data.userId)
    .eq("role", parsed.data.role)
    .select("role");
  if (error) return fail(guardMessage(error, "Could not revoke the role."));
  if (!removed?.length) return ok("They don't have that role.");

  await logAudit(ctx, {
    action: "revoked_role",
    table: "user_roles",
    id: parsed.data.userId,
    before: { role: parsed.data.role },
    after: null,
  });
  revalidateUser(parsed.data.userId);
  return ok(`${ROLE_LABELS[parsed.data.role]} role revoked.`);
}

/**
 * Deactivates or reactivates an account. Two things happen together: the
 * profile is flagged (which hides the account's published work from the
 * public and removes any admin access), and Supabase Auth bans or unbans the
 * user so they cannot sign in. The ban needs the service-role key, used only
 * here, on the server, after the permission check and after the database has
 * accepted the change (its triggers reject deactivating yourself, an admin
 * unless you are a super admin, or the last super admin).
 */
export async function setAccountActive(userId: string, active: boolean): Promise<ActionState> {
  const ctx = await authorize("users");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(userId).success) return fail("Unknown account.");
  if (!active && userId === ctx.user.id) return fail("You can't deactivate your own account.");

  const { data: before } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!before) return fail("This account no longer exists.");
  if (before.is_active === active) return ok(active ? "This account is already active." : "This account is already deactivated.");

  const { data: updated, error } = await ctx.supabase
    .from("profiles")
    .update({
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
      deactivated_by: active ? null : ctx.user.id,
    })
    .eq("id", userId)
    .select("id");
  if (error || !updated?.length) {
    return fail(error ? guardMessage(error, "Could not update the account.") : "Could not update the account.");
  }

  const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (authError) {
    // Put the flag back so the two never disagree.
    await ctx.supabase
      .from("profiles")
      .update({ is_active: !active, deactivated_at: null, deactivated_by: null })
      .eq("id", userId);
    console.error("auth ban update failed:", authError.message);
    return fail("Could not update sign-in access, so nothing was changed. Please try again.");
  }

  await logAudit(ctx, {
    action: active ? "reactivated_account" : "deactivated_account",
    table: "profiles",
    id: userId,
    before: { is_active: !active },
    after: { is_active: active },
  });
  revalidateUser(userId);
  revalidatePath("/", "layout");
  return ok(active ? `${before.full_name} can sign in again.` : `${before.full_name} has been deactivated.`);
}
