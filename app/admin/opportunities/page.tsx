import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { PublishToggle } from "@/components/admin/publish-toggle";
import { toggleOpportunityPublished, deleteOpportunityAsAdmin } from "@/actions/admin-moderation";

export default async function AdminOpportunitiesPage() {
  const supabase = await createClient();
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, status, is_published")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-8">Opportunities</h1>
      {opportunities && opportunities.length > 0 ? (
        <div className="space-y-2">
          {opportunities.map((o) => (
            <div key={o.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">{o.title}</p>
                <Badge>{o.status}</Badge>
                <Badge>{o.is_published ? "published" : "draft"}</Badge>
              </div>
              <PublishToggle
                isPublished={o.is_published}
                onPublish={async () => {
                  "use server";
                  await toggleOpportunityPublished(o.id, true);
                }}
                onUnpublish={async () => {
                  "use server";
                  await toggleOpportunityPublished(o.id, false);
                }}
                onDelete={async () => {
                  "use server";
                  await deleteOpportunityAsAdmin(o.id);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No opportunities yet." description="Opportunities you publish will appear here and on the public Opportunities page." />
      )}
    </div>
  );
}
