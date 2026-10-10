"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";

/**
 * Super admin only. Each of these is also enforced in the database: the
 * maintenance columns by a trigger, session revocation inside its function.
 */

export async function setMaintenanceMode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("danger");
  if (!ctx) return FORBIDDEN;

  const on = formData.get("maintenance_mode") === "on";
  const message = z.string().trim().max(400).safeParse(formData.get("maintenance_message") ?? "");
  if (!message.success) return fail("Please fix the highlighted fields.", { maintenance_message: "Keep the message under 400 characters" });

  const { data: before } = await ctx.supabase
    .from("organization_settings")
    .select("maintenance_mode, maintenance_message")
    .eq("id", true)
    .maybeSingle();

  const values = { maintenance_mode: on, maintenance_message: message.data || null, updated_by: ctx.user.id };
  const { data: after, error } = await ctx.supabase
    .from("organization_settings")
    .update(values)
    .eq("id", true)
    .select("maintenance_mode, maintenance_message")
    .maybeSingle();
  if (error || !after) return fail(error?.code === "P0001" ? error.message : "Could not change maintenance mode.");

  await logAudit(ctx, {
    action: on ? "maintenance_on" : "maintenance_off",
    table: "organization_settings",
    id: "settings",
    before,
    after,
  });
  revalidatePath("/", "layout");
  return ok(on ? "Maintenance mode is on. Only staff can browse the site." : "Maintenance mode is off.", { viewHref: "/" });
}

export async function clearBanner(): Promise<ActionState> {
  const ctx = await authorize("danger");
  if (!ctx) return FORBIDDEN;

  const columns =
    "announcement_banner, announcement_banner_link, announcement_banner_active, announcement_banner_starts_at, announcement_banner_ends_at";
  const { data: before } = await ctx.supabase.from("organization_settings").select(columns).eq("id", true).maybeSingle();
  const { data: after, error } = await ctx.supabase
    .from("organization_settings")
    .update({
      announcement_banner: null,
      announcement_banner_link: null,
      announcement_banner_active: false,
      announcement_banner_starts_at: null,
      announcement_banner_ends_at: null,
      updated_by: ctx.user.id,
    })
    .eq("id", true)
    .select(columns)
    .maybeSingle();
  if (error || !after) return fail("Could not clear the banner.");

  await logAudit(ctx, {
    action: "cleared_banner",
    table: "organization_settings",
    id: "settings",
    before: before as Record<string, unknown> | null,
    after: after as unknown as Record<string, unknown>,
  });
  revalidatePath("/", "layout");
  return ok("The announcement banner has been cleared.", { viewHref: "/" });
}

/** Ends every session of one user. They can sign in again unless deactivated. */
export async function revokeSessions(userId: string): Promise<ActionState> {
  const ctx = await authorize("danger");
  if (!ctx) return FORBIDDEN;
  if (!z.uuid().safeParse(userId).success) return fail("Unknown account.");

  const { data, error } = await ctx.supabase.rpc("admin_revoke_sessions", { target: userId });
  if (error) {
    console.error("admin_revoke_sessions failed:", error.message);
    return fail("Could not revoke the sessions. The database did not allow it.");
  }

  await logAudit(ctx, { action: "revoked_sessions", table: "auth.sessions", id: userId, note: `${data ?? 0} sessions ended` });
  return ok(
    `${data ?? 0} session${data === 1 ? "" : "s"} ended. A page they already have open can keep working for up to an hour.`,
  );
}
