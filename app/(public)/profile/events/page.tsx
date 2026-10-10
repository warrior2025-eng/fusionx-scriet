import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Download, ScanLine, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { STATUS_LABELS, eventWhen, todayInIst, type RegistrationStatus } from "@/lib/events/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My events" };

type EventInfo = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  venue: string | null;
  status: string;
};
type Row = {
  id: string;
  status: RegistrationStatus;
  certificate_serial: string | null;
  events: EventInfo | null;
};

export default async function MyEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile/events");

  const [{ data }, { data: duty }] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("id, status, certificate_serial, events(id, title, event_date, event_time, venue, status)")
      .eq("user_id", user.id)
      .neq("status", "cancelled"),
    // Events this person has been asked to run check-in for.
    supabase.from("event_volunteers").select("events(id, title, event_date, event_time, venue, status)").eq("user_id", user.id),
  ]);

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.events);
  const today = todayInIst();
  const isPast = (r: Row) => r.status === "attended" || r.events!.status === "completed" || r.events!.event_date < today;
  const upcoming = rows.filter((r) => !isPast(r)).sort((a, b) => a.events!.event_date.localeCompare(b.events!.event_date));
  const past = rows.filter(isPast).sort((a, b) => b.events!.event_date.localeCompare(a.events!.event_date));

  // Waitlist places, for the few rows that need one.
  const places = new Map<string, number>();
  await Promise.all(
    upcoming
      .filter((r) => r.status === "waitlisted")
      .map(async (r) => {
        const { data: place } = await supabase.rpc("my_waitlist_position", { p_event: r.events!.id });
        if (typeof place === "number" && place > 0) places.set(r.id, place);
      }),
  );

  const dutyEvents = ((duty ?? []) as unknown as { events: EventInfo | null }[])
    .map((d) => d.events)
    .filter((e): e is EventInfo => Boolean(e) && e!.status !== "completed" && e!.status !== "cancelled");

  const card = (r: Row) => {
    const event = r.events!;
    const cancelled = event.status === "cancelled";
    return (
      <li key={r.id}>
        <CutCard className="flex h-auto flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-none">
                {cancelled ? "Event cancelled" : STATUS_LABELS[r.status]}
                {r.status === "waitlisted" && places.get(r.id) ? ` (#${places.get(r.id)})` : ""}
              </Badge>
            </div>
            <h3 className="mt-3 font-serif text-xl text-ink">
              <Link href={`/events/${event.id}`} className="hover:underline">
                {event.title}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-ink/70">
              {eventWhen(event.event_date, event.event_time)}
              {event.venue ? `, ${event.venue}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status === "registered" && !cancelled && (
              <LinkButton href={`/profile/events/${event.id}/ticket`} size="sm">
                <Ticket size={15} /> Ticket
              </LinkButton>
            )}
            {r.status === "attended" && r.certificate_serial && (
              <a
                href={`/api/certificates/${r.id}`}
                className="inline-flex items-center gap-2 rounded-sm bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                <Download size={15} aria-hidden /> Certificate
              </a>
            )}
            <LinkButton href={`/events/${event.id}`} variant="secondary" size="sm">
              Details <ArrowRight size={14} className="arrow-nudge" />
            </LinkButton>
          </div>
        </CutCard>
      </li>
    );
  };

  return (
    <Section className="pt-16 pb-24">
      <Eyebrow>My events</Eyebrow>
      <h1 className="mb-10 font-serif text-3xl tracking-tight text-ink md:text-4xl">Your registrations.</h1>

      {dutyEvents.length > 0 && (
        <div className="mb-12">
          <h2 className="mb-4 text-sm font-semibold text-ink">Check-in duty</h2>
          <ul className="space-y-3">
            {dutyEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3">
                <span className="text-sm text-ink">
                  <span className="font-medium">{event.title}</span>
                  <span className="text-ink/65">, {eventWhen(event.event_date, event.event_time)}</span>
                </span>
                <LinkButton href={`/check-in/${event.id}`} size="sm">
                  <ScanLine size={15} /> Open check-in
                </LinkButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-4 text-sm font-semibold text-ink">Upcoming</h2>
      {upcoming.length > 0 ? (
        <ul className="space-y-4">{upcoming.map(card)}</ul>
      ) : (
        <EmptyState
          title="You aren't registered for anything coming up."
          description="Events you register for will appear here, with your ticket."
          action={
            <LinkButton href="/events" size="sm">
              Browse events <ArrowRight size={14} className="arrow-nudge" />
            </LinkButton>
          }
        />
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-4 mt-12 text-sm font-semibold text-ink">Past</h2>
          <ul className="space-y-4">{past.map(card)}</ul>
        </>
      )}
    </Section>
  );
}
