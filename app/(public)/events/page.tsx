import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { EventRegisterButton } from "@/components/forms/event-register-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Events",
  description: "Upcoming and past FusionX events.",
};

export default async function EventsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [{ data: events }, { data: myRegistrations }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, description, event_date, event_time, venue, status, registration_url")
      .eq("is_published", true)
      .order("event_date", { ascending: true }),
    user
      ? supabase.from("event_registrations").select("event_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { event_id: string }[] }),
  ]);

  const myEventIds = new Set((myRegistrations ?? []).map((r) => r.event_id));

  return (
    <>
      <Section className="pt-16 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Events</p>
        <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-ink">
          Sessions, build days, and showcases.
        </h1>
      </Section>

      <Section className="pt-0">
        {events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((e) => (
              <div
                key={e.id}
                className="border border-ink/10 rounded-sm p-6 bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge>{e.status}</Badge>
                    <span className="text-xs text-ink/40">
                      {new Date(e.event_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      {e.event_time ? ` · ${e.event_time}` : ""}
                    </span>
                  </div>
                  <p className="font-medium text-ink">{e.title}</p>
                  {e.venue && <p className="text-xs text-ink/45 mt-0.5">{e.venue}</p>}
                  <p className="mt-2 text-sm text-ink/55 max-w-xl">{e.description}</p>
                </div>
                {e.status !== "completed" &&
                  (e.registration_url ? (
                    <a
                      href={e.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-sm font-medium text-accent hover:underline"
                    >
                      Register →
                    </a>
                  ) : (
                    <EventRegisterButton
                      eventId={e.id}
                      isRegistered={myEventIds.has(e.id)}
                      isSignedIn={!!user}
                    />
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No events scheduled yet."
            description="FusionX events will be listed here as they're announced."
          />
        )}
      </Section>
    </>
  );
}
