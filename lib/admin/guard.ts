import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capabilitiesFor, type Capability } from "@/lib/permissions/capabilities";
import type { AppRole } from "@/types/database";

/**
 * Who is making this request and what they may do. Resolved once per request
 * (React cache) and shared by the admin layout, the page and any action.
 *
 * A deactivated account has no capabilities, even while an access token it
 * was issued earlier is still valid.
 */
export const getAdminContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, roles: [] as AppRole[], caps: [] as Capability[], fullName: "" };

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name, is_active").eq("id", user.id).maybeSingle(),
  ]);

  const active = profile?.is_active !== false;
  const roles = active ? (roleRows ?? []).map((r) => r.role as AppRole) : [];
  return {
    supabase,
    user,
    roles,
    caps: capabilitiesFor(roles),
    fullName: (profile?.full_name as string | undefined) ?? user.email ?? "Staff",
  };
});

export type AdminContext = Awaited<ReturnType<typeof getAdminContext>> & {
  user: NonNullable<Awaited<ReturnType<typeof getAdminContext>>["user"]>;
};

/**
 * For pages. Sends a signed-out visitor to sign in, a non-staff member to the
 * site, and a staff member without this capability back to the overview.
 */
export async function requireCapability(cap: Capability, next = "/admin"): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!ctx.caps.includes("admin.access")) redirect("/");
  if (!ctx.caps.includes(cap)) redirect("/admin?denied=1");
  return ctx as AdminContext;
}

/**
 * For server actions and route handlers: the permission check that must be
 * repeated inside every write, whatever the UI showed. Returns null when the
 * caller may not do this.
 */
export async function authorize(cap: Capability): Promise<AdminContext | null> {
  const ctx = await getAdminContext();
  if (!ctx.user || !ctx.caps.includes(cap)) return null;
  return ctx as AdminContext;
}

export const FORBIDDEN = { status: "error", message: "You don't have permission to do this." } as const;
