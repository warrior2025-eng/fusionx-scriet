import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Clock, MapPin, Users } from "lucide-react";
import { EventRegisterButton } from "@/components/forms/event-register-button";
import { Badge } from "@/components/ui/badge";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { availability, eventWhen, istDateTime, seatsLine, type RegistrationStatus } from "@/lib/events/format";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function loadEvent(id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  // RLS: published events for everyone, drafts for staff only.
  const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  return data ? { supabase, event: data } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const found = await loadEvent(id);
  if (!found) return { title: "Event not found" };
  const { event } = found;
  return {
    title: String(event.title),
    description: String(event.description).slice(0, 160),
    ...(event.poster_path ? { openGraph: { images: [String(event.poster_path)] } } : {}),
  };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  const found = await loadEvent(id);
  if (!found) notFound();
  const { supabase, event } = found;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: seatData }, { data: mine }, { data: place }] = await Promise.all([
    supabase.rpc("event_seats", { p_event: id }),
    user
      ? supabase.from("event_registrations").select("status").eq("event_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? supabase.rpc("my_waitlist_position", { p_event: id }) : Promise.resolve({ data: null }),
  ]);

  const seats = seatData as { capacity: number | null; registered: number; waitlisted: number } | null;
  const forSeats = {
    status: String(event.status),
    registration_open: event.registration_open !== false,
    registration_deadline: (event.registration_deadline as string | null) ?? null,
    registration_url: (event.registration_url as string | null) ?? null,
    waitlist_enabled: Boolean(event.waitlist_enabled),
  };
  const myStatus = (mine?.status as RegistrationStatus | undefined) ?? null;
  const active = myStatus && myStatus !== "cancelled" ? myStatus : null;
  const seatText = seatsLine(forSeats, seats);
  const cancelled = event.status === "cancelled";

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pt-16 pb-10 md:pt-20 md:pb-12">
          <Eyebrow>
            <Link href="/events" className="hover:underline">
              Events
            </Link>
          </Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="rounded-none capitalize">{String(event.status)}</Badge>
            {!event.is_published && <Badge className="rounded-none">Draft, visible to staff only</Badge>}
          </div>
          <h1 className="mt-4 max-w-3xl font-serif text-3xl tracking-tight text-ink md:text-5xl">{String(event.title)}</h1>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {event.poster_path && (
              <Image
                src={String(event.poster_path)}
                alt=""
                width={1200}
                height={675}
                sizes="(min-width: 1024px) 640px, 100vw"
                priority
                className="mb-8 h-auto w-full border border-line"
              />
            )}
            <div className="prose-fx max-w-none">
              <p className="whitespace-pre-line">{String(event.description)}</p>
            </div>
            {event.organizer && <p className="mt-6 text-sm text-ink/65">Organised by {String(event.organizer)}</p>}
          </div>

          <div className="lg:col-span-5">
            <CutCard className="h-auto lg:sticky lg:top-24">
              <dl className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <Clock size={18} className="mt-0.5 shrink-0 text-ink/60" aria-hidden />
                  <div>
                    <dt className="sr-only">When</dt>
                    <dd className="font-medium text-ink">
                      {eventWhen(String(event.event_date), event.event_time as string | null)}
                    </dd>
                    {event.end_date && <dd className="text-ink/65">Ends {istDateTime(event.end_date as string)}</dd>}
                  </div>
                </div>
                {event.venue && (
                  <div className="flex gap-3">
                    <MapPin size={18} className="mt-0.5 shrink-0 text-ink/60" aria-hidden />
                    <div>
                      <dt className="sr-only">Venue</dt>
                      <dd className="font-medium text-ink">{String(event.venue)}</dd>
                    </div>
                  </div>
                )}
                {seatText && !cancelled && (
                  <div className="flex gap-3">
                    <Users size={18} className="mt-0.5 shrink-0 text-ink/60" aria-hidden />
                    <div>
                      <dt className="sr-only">Seats</dt>
                      <dd className="font-medium text-ink">{seatText}</dd>
                    </div>
                  </div>
                )}
              </dl>

              {event.registration_deadline && !cancelled && (
                <p className="mt-4 text-sm text-ink/65">
                  Register by {istDateTime(event.registration_deadline as string)}
                </p>
              )}

              <div className="mt-6 border-t border-line pt-6">
                {cancelled ? (
                  <p className="font-medium text-ink">This event has been cancelled.</p>
                ) : (
                  <EventRegisterButton
                    eventId={id}
                    isSignedIn={Boolean(user)}
                    availability={availability(forSeats, seats)}
                    status={active}
                    position={typeof place === "number" && place > 0 ? place : null}
                    externalUrl={forSeats.registration_url}
                  />
                )}
              </div>

              {!cancelled && (
                <a
                  href={`/events/${id}/calendar.ics`}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent underline underline-offset-2"
                >
                  <CalendarPlus size={16} aria-hidden /> Add to calendar
                </a>
              )}
            </CutCard>
          </div>
        </div>
      </Section>
    </>
  );
}
