import { createAdminClient } from "@/lib/supabase/server";
import type { AdminContext } from "./guard";

export type Registration = {
  userId: string;
  name: string;
  department: string | null;
  year: string | null;
  /** Only filled for staff who may view users. */
  email: string | null;
  registeredAt: string;
};

/**
 * Who has registered for an event. Names come through the caller's own
 * session (staff can read profiles). Emails are added only for roles with
 * the "users" capability, since they need the service-role key to read.
 */
export async function eventRegistrations(ctx: AdminContext, eventId: string): Promise<Registration[]> {
  const { data: rows } = await ctx.supabase
    .from("event_registrations")
    .select("user_id, registered_at")
    .eq("event_id", eventId)
    .order("registered_at", { ascending: true });
  const registrations = rows ?? [];
  if (registrations.length === 0) return [];

  const ids = registrations.map((r) => r.user_id as string);
  const { data: profiles } = await ctx.supabase.from("profiles").select("id, full_name, department, year").in("id", ids);
  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const emailOf = new Map<string, string>();
  if (ctx.caps.includes("users")) {
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
      userId: r.user_id as string,
      name: (profile?.full_name as string | undefined) ?? "Unknown",
      department: (profile?.department as string | null | undefined) ?? null,
      year: (profile?.year as string | null | undefined) ?? null,
      email: emailOf.get(r.user_id as string) ?? null,
      registeredAt: r.registered_at as string,
    };
  });
}
