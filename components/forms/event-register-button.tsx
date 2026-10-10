"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cancelRegistration, registerForEvent } from "@/actions/events";
import { Button, LinkButton } from "@/components/ui/button";
import type { RegistrationAvailability, RegistrationStatus } from "@/lib/events/format";

/**
 * The registration control on an event page. One of:
 *   Sign in to register / Register / Join the waitlist / Registered ✓ /
 *   Waitlisted (#3) / Attended ✓ / Registration closed / Event full
 * plus "Cancel registration" while registered or waitlisted.
 *
 * It only shows what is possible; the database decides (and can still refuse,
 * e.g. when the last seat went a second ago), and that message is shown here.
 */
export function EventRegisterButton({
  eventId,
  isSignedIn,
  availability,
  status,
  position,
  externalUrl,
}: {
  eventId: string;
  isSignedIn: boolean;
  availability: RegistrationAvailability;
  /** The signed-in user's own registration, if any. */
  status: RegistrationStatus | null;
  position: number | null;
  externalUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action(eventId);
      setError(result.error ?? null);
    });

  const note = (text: string) => <p className="text-sm text-ink/70">{text}</p>;
  const problem = error && (
    <p role="alert" className="text-sm text-red-600">
      {error}
    </p>
  );

  // Already attended: nothing left to do here.
  if (status === "attended") {
    return (
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 font-medium text-ink">
          <Check size={18} className="text-accent" aria-hidden /> You attended this event
        </p>
        <Link href="/profile/events" className="block text-sm text-accent underline underline-offset-2">
          Go to My events
        </Link>
      </div>
    );
  }

  if (status === "registered" || status === "waitlisted") {
    return (
      <div className="space-y-3">
        <p className="inline-flex items-center gap-2 font-medium text-ink">
          {status === "registered" ? (
            <>
              <Check size={18} className="text-accent" aria-hidden /> Registered
            </>
          ) : (
            <>Waitlisted{position ? ` (#${position})` : ""}</>
          )}
        </p>
        {status === "waitlisted" && note("You will be registered automatically, and notified, if a seat opens up.")}
        <div className="flex flex-wrap gap-3">
          {status === "registered" && (
            <LinkButton href={`/profile/events/${eventId}/ticket`} size="md">
              View ticket <ArrowRight size={15} className="arrow-nudge" />
            </LinkButton>
          )}
          <Button type="button" variant="secondary" size="md" loading={pending} onClick={() => run(cancelRegistration)}>
            Cancel registration
          </Button>
        </div>
        {problem}
      </div>
    );
  }

  if (availability === "external" && externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-2 rounded-sm bg-accent px-6 py-3 font-medium text-white hover:bg-accent/90"
      >
        Register on the organiser&rsquo;s site <ArrowRight size={16} className="arrow-nudge" aria-hidden />
      </a>
    );
  }

  if (availability === "closed") return <p className="font-medium text-ink">Registration closed</p>;
  if (availability === "full") return <p className="font-medium text-ink">Event full</p>;

  if (!isSignedIn) {
    return (
      <div className="space-y-2">
        <LinkButton href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`} size="lg">
          Sign in to register <ArrowRight size={16} className="arrow-nudge" />
        </LinkButton>
        {availability === "waitlist" && note("All seats are taken. You can join the waitlist after signing in.")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" loading={pending} onClick={() => run(registerForEvent)}>
        {availability === "waitlist" ? "Join the waitlist" : "Register"}
      </Button>
      {availability === "waitlist" && note("All seats are taken. You will be registered if one opens up.")}
      {problem}
    </div>
  );
}
