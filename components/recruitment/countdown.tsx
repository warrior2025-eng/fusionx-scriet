"use client";

import { useEffect, useState } from "react";

function left(target: number, now: number): string {
  const ms = target - now;
  if (ms <= 0) return "";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ${hours} hr`;
  if (hours > 0) return `${hours} hr ${minutes % 60} min`;
  return `${Math.max(minutes, 1)} min`;
}

/** "3 days 4 hr left", counting down to a deadline. Renders nothing once it has passed. */
export function Countdown({ until, prefix = "", suffix = " left" }: { until: string; prefix?: string; suffix?: string }) {
  // Filled in after mount, so the server and the browser never disagree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return null;
  const text = left(new Date(until).getTime(), now);
  if (!text) return null;
  return (
    <span className="tabular-nums">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
