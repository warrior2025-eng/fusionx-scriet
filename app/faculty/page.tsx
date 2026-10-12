import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings, approvalStatusLabel } from "@/lib/data/organization";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/actions/auth";
import { STAGES, STAGE_LABELS, getCurrentCycle } from "@/lib/recruitment/data";

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

  // Read-only numbers for recruitment and FusionX Teams. Counts only: the
  // database gives faculty no applications, and only verified teams.
  const cycle = await getCurrentCycle();
  const [{ data: recruitment }, { count: verifiedTeams }] = await Promise.all([
    cycle ? supabase.rpc("recruitment_stats", { p_cycle: cycle.id }) : Promise.resolve({ data: null }),
    supabase.from("teams").select("*", { count: "exact", head: true }).eq("verification_status", "verified"),
  ]);
  const stats = recruitment as { submitted: number; by_team: { team_id: string; team: string; stages: Record<string, number> }[] } | null;

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

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="border border-ink/10 rounded-sm p-5 bg-surface">
          <p className="text-2xl font-semibold text-ink">{verifiedTeams ?? 0}</p>
          <p className="text-sm text-ink/50 mt-1">Verified FusionX Teams</p>
        </div>
        <div className="border border-ink/10 rounded-sm p-5 bg-surface">
          <p className="text-2xl font-semibold text-ink">{stats?.submitted ?? 0}</p>
          <p className="text-sm text-ink/50 mt-1">{cycle ? `Recruitment applications: ${cycle.title}` : "Recruitment applications"}</p>
        </div>
      </div>

      {stats && stats.by_team.length > 0 && (
        <div className="mt-6 overflow-x-auto border border-ink/10 bg-surface">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Recruitment applications per team per stage</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-ink/10 px-4 py-3 font-semibold text-ink">Team</th>
                {STAGES.map((stage) => (
                  <th key={stage} scope="col" className="border-b border-ink/10 px-3 py-3 text-xs font-semibold text-ink/60">
                    {STAGE_LABELS[stage]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.by_team.map((team) => (
                <tr key={team.team_id}>
                  <td className="border-b border-ink/10 px-4 py-2.5 text-ink">{team.team}</td>
                  {STAGES.map((stage) => (
                    <td key={stage} className="border-b border-ink/10 px-3 py-2.5 tabular-nums text-ink/70">
                      {team.stages[stage] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-10 text-sm text-ink/45 max-w-lg">
        This is a read-oriented overview. Faculty oversight covers initiative activity. It does
        not include unrestricted administrative controls over member data or settings.
      </p>
    </div>
  );
}
