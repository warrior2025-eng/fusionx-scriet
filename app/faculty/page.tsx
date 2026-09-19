import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings, approvalStatusLabel } from "@/lib/data/organization";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/actions/auth";

export default async function FacultyDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/faculty");

  // Faculty role grants oversight access here; it does not imply admin rights
  // elsewhere (enforced again by is_staff()/is_admin() in RLS, not just here).
  const authorized = (await hasRole("faculty")) || (await isAdmin());
  if (!authorized) redirect("/");

  const supabase = await createClient();
  const [{ count: projects }, { count: research }, { count: events }, { count: applications }] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("research").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "submitted"),
  ]);

  const settings = await getOrganizationSettings();

  const metrics = [
    { label: "Total Projects", value: projects ?? 0 },
    { label: "Research Entries", value: research ?? 0 },
    { label: "Upcoming Events", value: events ?? 0 },
    { label: "Pending Applications", value: applications ?? 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Faculty Dashboard</h1>
          <p className="text-sm text-ink/50 mt-1">{settings.faculty_guide_title}</p>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-ink/55 hover:text-ink">Sign out</button>
        </form>
      </div>

      <div className="mb-8">
        <Badge>{approvalStatusLabel(settings.institutional_approval)}</Badge>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="border border-ink/10 rounded-sm p-5 bg-surface">
            <p className="text-2xl font-semibold text-ink">{m.value}</p>
            <p className="text-sm text-ink/50 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink/45 max-w-lg">
        This is a read-oriented overview. Faculty oversight covers initiative activity — it does
        not include unrestricted administrative controls over member data or settings.
      </p>
    </div>
  );
}
