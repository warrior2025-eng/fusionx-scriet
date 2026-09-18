import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [
    { count: activeProjects },
    { count: researchEntries },
    { count: upcomingEvents },
    { count: openOpportunities },
    { count: pendingApplications },
    { count: members },
  ] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("research").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
    supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const metrics = [
    { label: "Active Projects", value: activeProjects ?? 0 },
    { label: "Research Entries", value: researchEntries ?? 0 },
    { label: "Upcoming Events", value: upcomingEvents ?? 0 },
    { label: "Open Opportunities", value: openOpportunities ?? 0 },
    { label: "Pending Applications", value: pendingApplications ?? 0 },
    { label: "Members", value: members ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-8">Overview</h1>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="border border-ink/10 rounded-sm p-5 bg-white/60">
            <p className="text-2xl font-semibold text-ink">{m.value}</p>
            <p className="text-sm text-ink/50 mt-1">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
