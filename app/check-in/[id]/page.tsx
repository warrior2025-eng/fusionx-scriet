import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadRoster } from "@/actions/check-in";
import { CheckInClient } from "@/components/events/check-in-client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { eventWhen } from "@/lib/events/format";
import { getCurrentRoles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Check-in", robots: { index: false, follow: false } };

/**
 * Event check-in, built for a phone at the door. Open to staff and to the
 * volunteers an admin assigned to this event; the database checks that again
 * on every scan. It lives outside /admin because volunteers have no admin
 * access.
 */
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/check-in/${id}`)}`);

  const { data: allowed } = await supabase.rpc("is_event_checker", { p_event: id });
  if (allowed !== true) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
        <h1 className="font-serif text-2xl text-ink">You can&rsquo;t run check-in for this event</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink/70">
          Check-in is open to staff and to volunteers an admin has assigned to the event. Ask an admin to add you.
        </p>
        <Link href="/profile/events" className="mt-6 text-sm text-accent underline underline-offset-2">
          Go to My events
        </Link>
      </main>
    );
  }

  const [{ data: event }, roster, roles] = await Promise.all([
    supabase.from("events").select("id, title, event_date, event_time, venue, status").eq("id", id).maybeSingle(),
    loadRoster(id),
    getCurrentRoles(),
  ]);
  if (!event) notFound();
  const staff = roles.some((role) => role === "super_admin" || role === "admin" || role === "editor");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href={staff ? `/admin/events/${id}/registrations` : "/profile/events"} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
            <Image src="/icon-192.png" alt="" width={28} height={28} className="h-7 w-7" />
            Check-in
          </Link>
          <ThemeToggle className="rounded-sm p-2 text-ink/70 hover:bg-ink/5 hover:text-ink" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <h1 className="font-serif text-2xl leading-snug text-ink">{String(event.title)}</h1>
        <p className="mt-1 text-sm text-ink/70">
          {eventWhen(String(event.event_date), event.event_time as string | null)}
          {event.venue ? `, ${event.venue}` : ""}
        </p>
        {event.status === "cancelled" && (
          <p role="alert" className="mt-4 border border-red-500/50 bg-red-500/10 px-3.5 py-2.5 text-sm text-ink">
            This event has been cancelled.
          </p>
        )}
        <div className="mt-6">
          <CheckInClient eventId={id} initialRoster={roster ?? []} canUndo={staff} />
        </div>
      </main>
    </div>
  );
}
