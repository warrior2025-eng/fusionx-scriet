import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AnnouncementControls } from "@/components/admin/announcement-controls";
import { LinkButton } from "@/components/ui/button";

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Announcements</h1>
        <LinkButton href="/admin/announcements/new" size="sm">New announcement</LinkButton>
      </div>
      {announcements && announcements.length > 0 ? (
        <div className="space-y-2">
          {announcements.map((a) => (
            <div key={a.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">{a.title}</p>
                <Badge>{a.status}</Badge>
              </div>
              <AnnouncementControls id={a.id} status={a.status} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No announcements yet." description="Published announcements will appear here." />
      )}
    </div>
  );
}
