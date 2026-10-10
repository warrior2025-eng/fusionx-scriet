import { createAdminClient } from "@/lib/supabase/server";
import type { AdminContext } from "./guard";
import type { AppRole, Profile } from "@/types/database";

export type AdminUser = {
  id: string;
  email: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  fullName: string;
  department: string | null;
  year: string | null;
  joinedAt: string;
  isActive: boolean;
  roles: AppRole[];
};

/**
 * Every account, with its email, profile and roles.
 *
 * Emails live in auth.users, which only the service-role key can list, so
 * this is the one place the admin panel reads with it. Call it only after
 * the "users" capability has been checked; it never runs in the browser.
 * Profiles and roles are still read with the caller's own session, so RLS
 * applies to them as usual.
 */
export async function listUsers(ctx: AdminContext): Promise<AdminUser[]> {
  const admin = createAdminClient();
  const accounts: { id: string; email?: string; email_confirmed_at?: string | null; last_sign_in_at?: string | null; created_at: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list accounts: ${error.message}`);
    accounts.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const [{ data: profiles }, { data: roleRows }] = await Promise.all([
    ctx.supabase.from("profiles").select("id, full_name, department, year, created_at, is_active"),
    ctx.supabase.from("user_roles").select("user_id, role"),
  ]);

  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p as Partial<Profile>]));
  const rolesOf = new Map<string, AppRole[]>();
  for (const row of roleRows ?? []) {
    rolesOf.set(row.user_id as string, [...(rolesOf.get(row.user_id as string) ?? []), row.role as AppRole]);
  }

  return accounts
    .map((account) => {
      const profile = profileOf.get(account.id);
      return {
        id: account.id,
        email: account.email ?? "",
        emailConfirmed: Boolean(account.email_confirmed_at),
        lastSignInAt: account.last_sign_in_at ?? null,
        fullName: profile?.full_name ?? account.email ?? "Unknown",
        department: profile?.department ?? null,
        year: profile?.year ?? null,
        joinedAt: profile?.created_at ?? account.created_at,
        isActive: profile?.is_active !== false,
        roles: rolesOf.get(account.id) ?? [],
      };
    })
    .sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1));
}

/** The list page and the CSV export filter through this, so they always agree. */
export function filterUsers(users: AdminUser[], filters: { q?: string; role?: string; state?: string }): AdminUser[] {
  const q = (filters.q ?? "").toLowerCase();
  return users.filter((user) => {
    if (q && ![user.fullName, user.email, user.department ?? "", user.year ?? ""].some((v) => v.toLowerCase().includes(q))) {
      return false;
    }
    if (filters.role && !user.roles.includes(filters.role as AppRole)) return false;
    if (filters.state === "active" && !user.isActive) return false;
    if (filters.state === "deactivated" && user.isActive) return false;
    if (filters.state === "unverified" && user.emailConfirmed) return false;
    return true;
  });
}

/** One account's sign-in email. Same caveat as listUsers. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}
