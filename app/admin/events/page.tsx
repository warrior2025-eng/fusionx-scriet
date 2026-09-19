import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_date, status, is_published")
    .order("event_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-8">Events</h1>
      {events && events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{e.title}</p>
              <div className="flex items-center gap-2">
                <Badge>{e.status}</Badge>
                <Badge>{e.is_published ? "published" : "draft"}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No events yet." description="Create an event to have it appear here and on the public Events page." />
      )}
    </div>
  );
}
