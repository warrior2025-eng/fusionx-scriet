import { createAdminClient } from "@/lib/supabase/server";
import type { RegistrationStatus } from "@/lib/events/format";
import type { AdminContext } from "./guard";

export type Registration = {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  year: string | null;
  /** Only filled for staff who may view users. */
  email: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  checkedInAt: string | null;
  certificateSerial: string | null;
  certificateIssuedAt: string | null;
};

/**
 * Everyone who has registered for an event, in the order they did. Names come
 * through the caller's own session (staff can read profiles). Emails are
 * added only for roles with the "users" capability, since they need the
 * service-role key to read. Check-in tokens are never selected here.
 */
export async function eventRegistrations(ctx: AdminContext, eventId: string): Promise<Registration[]> {
  const { data: rows } = await ctx.supabase
    .from("event_registrations")
    .select("id, user_id, status, registered_at, checked_in_at, certificate_serial, certificate_issued_at")
    .eq("event_id", eventId)
    .order("registered_at", { ascending: true });
  const registrations = rows ?? [];
  if (registrations.length === 0) return [];

  const ids = registrations.map((r) => r.user_id as string);
  const { data: profiles } = await ctx.supabase.from("profiles").select("id, full_name, department, year").in("id", ids);
  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const emailOf = new Map<string, string>();
  if (ctx.caps.includes("users") && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    await Promise.all(
      ids.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data.user?.email) emailOf.set(id, data.user.email);
      }),
    );
  }

  return registrations.map((r) => {
    const profile = profileOf.get(r.user_id as string);
    return {
      id: r.id as string,
      userId: r.user_id as string,
      name: (profile?.full_name as string | undefined) ?? "Unknown",
      department: (profile?.department as string | null | undefined) ?? null,
      year: (profile?.year as string | null | undefined) ?? null,
      email: emailOf.get(r.user_id as string) ?? null,
      status: r.status as RegistrationStatus,
      registeredAt: r.registered_at as string,
      checkedInAt: (r.checked_in_at as string | null) ?? null,
      certificateSerial: (r.certificate_serial as string | null) ?? null,
      certificateIssuedAt: (r.certificate_issued_at as string | null) ?? null,
    };
  });
}

/** The same search and status filter for the page and the CSV export. */
export function filterRegistrations(rows: Registration[], filters: { q?: string; status?: string }): Registration[] {
  const q = (filters.q ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (q && ![r.name, r.email ?? "", r.department ?? "", r.year ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
    return true;
  });
}
