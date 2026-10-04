import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
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
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/95 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute top-0 left-1/3 w-[500px] h-[300px] bg-accent/[0.04] rounded-full blur-[100px]" aria-hidden />

        <div className="container-fx relative z-10 pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-3">Events</p>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Sessions, build days, and showcases.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        {events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((e, i) => (
              <ScrollReveal key={e.id} delay={i * 70}>
                <div className="card-elevated rounded-sm p-6 md:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Badge>{e.status}</Badge>
                      <span className="text-xs text-ink/45 font-medium">
                        {new Date(e.event_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        {e.event_time ? ` · ${e.event_time}` : ""}
                      </span>
                    </div>
                    <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">{e.title}</p>
                    {e.venue && <p className="text-xs text-ink/45 mt-1">{e.venue}</p>}
                    <p className="mt-3 text-sm text-ink/55 leading-relaxed">{e.description}</p>
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
                      <div className="shrink-0">
                        <EventRegisterButton
                          eventId={e.id}
                          isRegistered={myEventIds.has(e.id)}
                          isSignedIn={!!user}
                        />
                      </div>
                    ))}
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <ScrollReveal>
            <EmptyState
              title="No events scheduled yet."
              description="FusionX events will be listed here as they're announced."
            />
          </ScrollReveal>
        )}
      </Section>
    </>
  );
}
