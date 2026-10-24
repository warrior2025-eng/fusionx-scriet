"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { LinkButton } from "@/components/ui/button";
import { slotTime } from "@/lib/recruitment/slots";

/**
 * "Your interview starts in 5 minutes: get ready", on the status page and in
 * the waiting room, from `minutes` before the slot until it starts (by the
 * database's clock). A browser notification is shown too, only if the
 * candidate allowed it with "Alert me" (nothing is asked unless they tap it).
 */
export function ReminderBanner({
  startsAt,
  serverNow,
  minutes = 5,
  room = true,
  href,
}: {
  startsAt: string;
  serverNow?: string;
  minutes?: number;
  room?: boolean;
  href?: string;
}) {
  const { tick } = useServerClock(serverNow);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const notified = useRef(false);
  const start = new Date(startsAt).getTime();
  const left = tick === null ? null : start - tick;
  const due = left !== null && left > 0 && left <= minutes * 60_000;
  const later = left !== null && left > minutes * 60_000 && left < 24 * 3600_000;

  useEffect(() => {
    const t = window.setTimeout(() => setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!due || notified.current || permission !== "granted") return;
    notified.current = true;
    try {
      new Notification("Your FusionX@SCRIET interview starts soon", {
        body: `It starts at ${slotTime(startsAt)}${room ? ", on the FusionX@SCRIET website (not Google Meet)" : ""}. Get ready.`,
        tag: `fx-interview-${startsAt}`,
      });
    } catch {}
  }, [due, permission, startsAt, room]);

  if (left === null || left <= 0) return null;
  if (due) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
        <p className="flex items-center gap-2">
          <BellRing size={18} aria-hidden />
          <span>
            <span className="font-semibold">Your interview starts in {countdownText(left)}: get ready.</span>{" "}
            {room ? "It takes place here, on the FusionX@SCRIET website, not on Google Meet." : "Open your joining details below."}
          </span>
        </p>
        {href && (
          <LinkButton href={href} size="sm">
            Join interview room
          </LinkButton>
        )}
      </div>
    );
  }
  if (later && permission === "default") {
    return (
      <p className="text-sm text-ink/75">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-medium text-accent underline underline-offset-2"
          onClick={async () => {
            try {
              setPermission(await Notification.requestPermission());
            } catch {}
          }}
        >
          <BellRing size={14} aria-hidden /> Alert me {minutes} minutes before my interview
        </button>{" "}
        (keep this page open).
      </p>
    );
  }
  return null;
}
