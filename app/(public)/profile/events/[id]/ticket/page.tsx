import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PrintButton } from "@/components/events/print-button";
import { QrCode } from "@/components/events/qr-code";
import { eventWhen } from "@/lib/events/format";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ticket", robots: { index: false, follow: false } };

/**
 * A member's own ticket. The QR code holds only the random check-in token:
 * no name, no email, no ids. The ticket itself is black on white in both
 * themes so it scans from a screen and prints cleanly.
 */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/profile/events/${id}/ticket`)}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // RLS returns this row only to its owner.
  const [{ data: registration }, { data: profile }, settings] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("status, check_in_token, events(id, title, event_date, event_time, venue, status)")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    getOrganizationSettings(),
  ]);

  const event = registration?.events as unknown as {
    id: string;
    title: string;
    event_date: string;
    event_time: string | null;
    venue: string | null;
    status: string;
  } | null;
  if (!registration || !event) notFound();

  const status = String(registration.status);
  const usable = status === "registered" && event.status !== "cancelled";

  return (
    <div className="container-fx max-w-xl py-12 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/profile/events" className="text-sm text-ink/70 underline underline-offset-2 hover:text-ink">
          Back to My events
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/events/${event.id}/calendar.ics`}
            className="inline-flex items-center gap-2 rounded-sm border border-ink/40 px-3.5 py-1.5 text-sm font-medium text-ink hover:border-ink"
          >
            <CalendarPlus size={15} aria-hidden /> Add to calendar
          </a>
          <PrintButton />
        </div>
      </div>

      <article className="border border-[#00030D]/20 bg-white p-6 text-[#00030D] sm:p-8">
        <header className="flex items-center gap-3 border-b border-[#00030D]/15 pb-5">
          <Image src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10" />
          <div>
            <p className="font-semibold leading-tight">{settings.chapter_name}</p>
            <p className="text-xs text-[#00030D]/65">Event ticket</p>
          </div>
        </header>

        <h1 className="mt-6 font-serif text-2xl leading-snug sm:text-3xl">{event.title}</h1>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-[#00030D]/60">When</dt>
            <dd className="mt-1 font-medium">{eventWhen(event.event_date, event.event_time)}</dd>
          </div>
          {event.venue && (
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-[#00030D]/60">Venue</dt>
              <dd className="mt-1 font-medium">{event.venue}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.1em] text-[#00030D]/60">Attendee</dt>
            <dd className="mt-1 font-medium">{profile?.full_name ?? "Member"}</dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col items-center border-t border-[#00030D]/15 pt-8">
          {usable ? (
            <>
              <QrCode
                value={String(registration.check_in_token)}
                label="Your check-in code"
                className="h-64 w-64 max-w-full"
              />
              <p className="mt-4 text-center text-sm text-[#00030D]/75">Show this code at the entrance to check in.</p>
            </>
          ) : (
            <p className="py-6 text-center font-medium">
              {status === "attended"
                ? "You have been checked in for this event."
                : status === "waitlisted"
                  ? "You are on the waitlist. Your ticket appears here if a seat opens up."
                  : event.status === "cancelled"
                    ? "This event has been cancelled."
                    : "This registration is cancelled."}
            </p>
          )}
        </div>
      </article>

      <p className="mt-4 text-center text-xs text-ink/60 print:hidden">
        Turn your screen brightness up when showing the code. A screenshot works too.
      </p>
    </div>
  );
}
