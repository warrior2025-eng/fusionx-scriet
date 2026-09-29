import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { PublishToggle } from "@/components/admin/publish-toggle";
import { toggleProjectPublished, deleteProjectAsAdmin } from "@/actions/admin-moderation";

export default async function AdminProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, is_published, owner_id")
    .order("updated_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-2">Projects</h1>
      <p className="text-sm text-ink/50 mb-8">
        Full create/edit tooling lives on each project&rsquo;s own page for its owner. This view is
        for moderation — publish, unpublish, or remove listings that violate the Code of Conduct.
      </p>
      {projects && projects.length > 0 ? (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">{p.title}</p>
                <Badge>{p.status}</Badge>
                <Badge>{p.is_published ? "published" : "draft"}</Badge>
              </div>
              <PublishToggle
                isPublished={p.is_published}
                onPublish={async () => {
                  "use server";
                  await toggleProjectPublished(p.id, true);
                }}
                onUnpublish={async () => {
                  "use server";
                  await toggleProjectPublished(p.id, false);
                }}
                onDelete={async () => {
                  "use server";
                  await deleteProjectAsAdmin(p.id);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No projects yet." description="Projects created by members will appear here." />
      )}
    </div>
  );
}
