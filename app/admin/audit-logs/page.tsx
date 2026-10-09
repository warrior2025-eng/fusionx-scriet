import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { isAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AdminAuditLogsPage() {
  // Audit logs are admin-only, one level stricter than the rest of /admin
  // (which allows editors too) — checked here in addition to RLS.
  const authorized = await isAdmin();
  if (!authorized) redirect("/admin");

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-2">Audit Logs</h1>
      <p className="text-sm text-ink/50 mb-8">Sensitive admin actions, most recent first.</p>

      {logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{l.action.replace(/_/g, " ")}</p>
                <p className="text-xs text-ink/40 mt-0.5">
                  {l.resource_type}
                  {l.resource_id ? `, ${l.resource_id}` : ""}
                </p>
              </div>
              <Badge>{new Date(l.created_at).toLocaleString("en-IN")}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No audit log entries yet." description="Sensitive admin actions will be recorded here." />
      )}
    </div>
  );
}
