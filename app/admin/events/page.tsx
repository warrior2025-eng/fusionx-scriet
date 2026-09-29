import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { PublishToggle } from "@/components/admin/publish-toggle";
import { LinkButton } from "@/components/ui/button";
import { toggleEventPublished, deleteEventAsAdmin } from "@/actions/admin-moderation";

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_date, status, is_published")
    .order("event_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Events</h1>
        <LinkButton href="/admin/events/new" size="sm">New event</LinkButton>
      </div>
      {events && events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">{e.title}</p>
                <Badge>{e.status}</Badge>
                <Badge>{e.is_published ? "published" : "draft"}</Badge>
              </div>
              <PublishToggle
                isPublished={e.is_published}
                onPublish={async () => {
                  "use server";
                  await toggleEventPublished(e.id, true);
                }}
                onUnpublish={async () => {
                  "use server";
                  await toggleEventPublished(e.id, false);
                }}
                onDelete={async () => {
                  "use server";
                  await deleteEventAsAdmin(e.id);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No events yet." description="Create an event to have it appear here and on the public Events page." />
      )}
    </div>
  );
}
