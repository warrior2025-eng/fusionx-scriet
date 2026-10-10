import type { Metadata } from "next";
import { pageMetadata } from "@/lib/data/seo";
import { Section } from "@/components/ui/section";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ArrowRight } from "lucide-react";
import { STATUS_LABELS, eventWhen, type RegistrationStatus } from "@/lib/events/format";
import Link from "next/link";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("events", { title: "Events", description: "Upcoming and past FusionX events." });

export default async function EventsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [{ data: events }, { data: myRegistrations }] = await Promise.all([
    supabase
      .from("events")
      // "*" so the registration switch is read once its column exists.
      .select("*")
      .eq("is_published", true)
      .order("event_date", { ascending: true }),
    user
      ? supabase.from("event_registrations").select("event_id, status").eq("user_id", user.id).neq("status", "cancelled")
      : Promise.resolve({ data: [] as { event_id: string; status: RegistrationStatus }[] }),
  ]);

  const myStatus = new Map(
    (myRegistrations ?? []).map((r) => [r.event_id as string, r.status as RegistrationStatus]),
  );

  return (
    <>
      <section className="border-b border-line">

        <div className="container-fx pt-20 pb-12 md:pt-24 md:pb-16">
          <ScrollReveal>
            <Eyebrow>Events</Eyebrow>
            <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-ink">
              Sessions, build days, and showcases.
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <Section>
        {events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((e, i) => (
              <ScrollReveal key={e.id} delay={i * 70}>
                <div className="card-elevated rounded-sm p-6 md:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Badge>{e.status}</Badge>
                      <span className="text-xs text-ink/45 font-medium">
                        {eventWhen(e.event_date, e.event_time)}
                      </span>
                    </div>
                    <p className="font-serif text-xl font-medium text-ink group-hover:text-accent transition-colors">
                      <Link href={`/events/${e.id}`} className="hover:underline">
                        {e.title}
                      </Link>
                    </p>
                    {e.venue && <p className="text-xs text-ink/45 mt-1">{e.venue}</p>}
                    <p className="mt-3 line-clamp-3 text-sm text-ink/55 leading-relaxed">{e.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    {myStatus.get(e.id) && (
                      <span className="text-sm font-medium text-ink">{STATUS_LABELS[myStatus.get(e.id)!]}</span>
                    )}
                    <Link
                      href={`/events/${e.id}`}
                      className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                    >
                      {e.status === "cancelled"
                        ? "Cancelled. View details"
                        : e.status === "completed"
                          ? "View details"
                          : "Details and registration"}
                      <ArrowRight size={14} className="arrow-nudge" aria-hidden />
                    </Link>
                  </div>
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
