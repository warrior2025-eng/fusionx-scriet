import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

/**
 * All permission checks live here and run server-side against Supabase,
 * which itself re-checks every query against RLS. Never gate access purely
 * on a role read into client state — a compromised or stale client must
 * never be the only thing standing between a user and admin data.
 */

/** The signed-in user, checked with Supabase Auth once per request (React cache: the layout and the page share it). */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Their roles, once per request. */
export const getCurrentRoles = cache(async (): Promise<AppRole[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).map((r) => r.role as AppRole);
});

export async function hasRole(role: AppRole): Promise<boolean> {
  const roles = await getCurrentRoles();
  return roles.includes(role);
}

export async function isAdmin(): Promise<boolean> {
  const roles = await getCurrentRoles();
  return roles.includes("super_admin") || roles.includes("admin");
}

export async function isStaff(): Promise<boolean> {
  const roles = await getCurrentRoles();
  return roles.some((r) => ["super_admin", "admin", "editor"].includes(r));
}

export async function isFaculty(): Promise<boolean> {
  return hasRole("faculty");
}

/**
 * Throws-on-failure variant for use at the top of protected server
 * components/actions, so a missing check fails loudly during development
 * instead of silently rendering an empty page.
 */
export async function requireRole(allowed: AppRole[]) {
  const roles = await getCurrentRoles();
  const ok = roles.some((r) => allowed.includes(r));
  if (!ok) {
    throw new Error("FORBIDDEN");
  }
}
