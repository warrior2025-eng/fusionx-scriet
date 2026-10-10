"use client";

import { useState, useTransition } from "react";
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
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) {
    return (
      <a href="/login?next=/events" className="shrink-0 text-sm font-medium text-accent hover:underline">
        Sign in to register
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button
        type="button"
        variant={isRegistered ? "secondary" : "primary"}
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await (isRegistered ? unregisterFromEvent(eventId) : registerForEvent(eventId));
            setError(result.error ?? null);
          })
        }
      >
        {isRegistered ? "Registered. Cancel?" : "Register"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
