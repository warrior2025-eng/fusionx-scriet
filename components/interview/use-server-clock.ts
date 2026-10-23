"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The database's clock in the browser: the page passes the server's "now"
 * (from the database) and this keeps the difference to the device's clock, so
 * a device set a few minutes wrong still opens and closes the room on time.
 * `tick` is that clock, updated every second (null until the first tick).
 */
export function useServerClock(serverNow: string | undefined) {
  const offset = useRef(0);
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    offset.current = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
    const update = () => setTick(Date.now() + offset.current);
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [serverNow]);
  const now = useCallback(() => Date.now() + offset.current, []);
  return { now, tick };
}

/** "4:05" / "1:02:09" for a countdown. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
