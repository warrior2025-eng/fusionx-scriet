"use client";

import { useTransition } from "react";
import { registerForEvent, unregisterFromEvent } from "@/actions/events";
import { Button } from "@/components/ui/button";

export function EventRegisterButton({
  eventId,
  isRegistered,
  isSignedIn,
}: {
  eventId: string;
  isRegistered: boolean;
  isSignedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!isSignedIn) {
    return (
      <a href="/login" className="shrink-0 text-sm font-medium text-accent hover:underline">
        Sign in to register
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant={isRegistered ? "secondary" : "primary"}
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(() => (isRegistered ? unregisterFromEvent(eventId) : registerForEvent(eventId)))
      }
    >
      {isRegistered ? "Registered ✓" : "Register"}
    </Button>
  );
}
