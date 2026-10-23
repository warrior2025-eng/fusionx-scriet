"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";

/**
 * A countdown to a moment (by the database's clock); at zero the page is
 * fetched again, and the database decides what it shows.
 */
export function RoomCountdown({ until, serverNow, className }: { until: string; serverNow?: string; className?: string }) {
  const router = useRouter();
  const { now, tick } = useServerClock(serverNow);
  const target = new Date(until).getTime();
  useEffect(() => {
    const timer = window.setTimeout(() => router.refresh(), Math.max(target - now(), 0) + 1500);
    return () => window.clearTimeout(timer);
  }, [target, now, router]);
  if (tick === null) return null;
  const days = Math.floor(Math.max(0, target - tick) / 86_400_000);
  return (
    <p className={className} role="timer" aria-live="off">
      <span className="font-serif text-3xl tabular-nums text-ink">
        {days > 0 ? `${days} day${days === 1 ? "" : "s"}, ` : ""}
        {countdownText((target - tick) % 86_400_000)}
      </span>
    </p>
  );
}
