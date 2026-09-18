import { createClient } from "@/lib/supabase/server";
import { ApplicationRow } from "@/components/admin/application-row";
import { EmptyState } from "@/components/ui/empty-state";
import type { Application } from "@/types/database";

export default async function AdminApplicationsPage() {
  const supabase = await createClient();
  const { data: applications } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-8">Applications</h1>
      {applications && applications.length > 0 ? (
        <div className="space-y-4">
          {(applications as Application[]).map((app) => (
            <ApplicationRow key={app.id} application={app} />
          ))}
        </div>
      ) : (
        <EmptyState title="No applications yet." description="Join FusionX applications will appear here as they're submitted." />
      )}
    </div>
  );
}
