import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-8">Announcements</h1>
      {announcements && announcements.length > 0 ? (
        <div className="space-y-2">
          {announcements.map((a) => (
            <div key={a.id} className="border border-ink/10 rounded-sm p-4 bg-white/60 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{a.title}</p>
              <Badge>{a.status}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No announcements yet." description="Published announcements will appear here." />
      )}
    </div>
  );
}
