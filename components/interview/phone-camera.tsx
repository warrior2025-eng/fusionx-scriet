"use client";

import { useEffect, useState } from "react";
import { LiveKitStage } from "@/components/interview/livekit-stage";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { Button } from "@/components/ui/button";
import { slotTime } from "@/lib/recruitment/slots";

/**
 * The phone's camera in the interview room: camera only, microphone off (the
 * token cannot send audio), no sound played. The candidate places the phone
 * to show their desk and hands. Started before the slot opens, it waits and
 * connects at the slot's join time; at the end of the slot it leaves (the
 * server removes it too).
 */
export function PhoneCamera({
  serverUrl,
  token,
  opensAt,
  closesAt,
  serverNow,
}: {
  serverUrl: string;
  token: string;
  opensAt: string;
  closesAt: string;
  serverNow?: string;
}) {
  const [state, setState] = useState<"idle" | "on" | "error" | "ended">("idle");
  const { now, tick } = useServerClock(serverNow);
  const opens = new Date(opensAt).getTime();
  const closes = new Date(closesAt).getTime();
  const early = tick !== null && tick < opens;

  // The slot is over: leave.
  useEffect(() => {
    const timer = window.setTimeout(() => setState("ended"), Math.max(closes - now(), 0) + 500);
    return () => window.clearTimeout(timer);
  }, [closes, now]);

  if (state === "ended") {
    return (
      <p className="mt-6 text-sm text-ink" role="status">
        The interview slot has ended. You can close this page.
      </p>
    );
  }
  return (
    <div className="mt-6">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
        <li>Keep this phone on charge, on a stand or against something steady.</li>
        <li>Point it at your desk so your hands and keyboard are visible.</li>
        <li>Leave this page open until your interview ends.</li>
      </ol>
      {state !== "on" && (
        <Button className="mt-5 w-full" onClick={() => setState("on")}>
          Start phone camera
        </Button>
      )}
      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-ink">
          Could not connect. Check the phone&rsquo;s internet and camera permission, then try again.
        </p>
      )}
      {state === "on" && early && (
        <p className="mt-5 text-sm text-ink" role="timer" aria-live="off">
          Ready. The phone camera joins at {slotTime(opensAt)}, in <span className="tabular-nums">{countdownText(opens - (tick ?? 0))}</span>. Keep this page open.
        </p>
      )}
      {state === "on" && !early && tick !== null && (
        <div className="mt-5 aspect-[3/4] w-full bg-black" aria-label="Phone camera">
          <LiveKitStage
            serverUrl={serverUrl}
            token={token}
            mode="phone"
            onDisconnected={(removed) => setState(removed ? "ended" : "idle")}
            onError={() => setState("error")}
          />
        </div>
      )}
    </div>
  );
}
