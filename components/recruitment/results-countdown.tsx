"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

/**
 * A live countdown to the results. When it reaches zero the page is fetched
 * again: the database decides from its own clock whether the results may be
 * shown, so nothing has to be redeployed and this timer cannot reveal
 * anything early.
 */
export function ResultsCountdown({ until, className }: { until: string; className?: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);
  const target = new Date(until).getTime();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (now === null || now < target || refreshed.current) return;
    refreshed.current = true;
    // A moment's grace for clocks that run a little fast.
    const later = window.setTimeout(() => router.refresh(), 1500);
    return () => window.clearTimeout(later);
  }, [now, target, router]);

  if (now === null) return null;
  if (now >= target) return <p className={className}>The results are being published. This page will update in a moment.</p>;
  const { days, hours, minutes, seconds } = parts(target - now);
  const cells: [number, string][] = [
    [days, days === 1 ? "day" : "days"],
    [hours, "hours"],
    [minutes, "minutes"],
    [seconds, "seconds"],
  ];
  return (
    <div className={className} role="timer" aria-label={`${days} days ${hours} hours ${minutes} minutes left`}>
      <ul className="flex flex-wrap gap-2">
        {cells.map(([value, label]) => (
          <li key={label} className="min-w-[4.25rem] border border-line bg-surface px-3 py-2 text-center">
            <span className="block font-serif text-2xl tabular-nums text-ink">{String(value).padStart(2, "0")}</span>
            <span className="block text-[11px] uppercase tracking-wide text-ink/60">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
