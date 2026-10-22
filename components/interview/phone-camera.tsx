"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import { Button } from "@/components/ui/button";

/**
 * The phone's camera in the interview room: camera only, microphone off (the
 * token cannot send audio). The candidate places the phone to show their desk
 * and hands.
 */
export function PhoneCamera({ url, token }: { url: string; token: string }) {
  const host = useRef<HTMLDivElement>(null);
  const call = useRef<DailyCall | null>(null);
  const [state, setState] = useState<"idle" | "joining" | "joined" | "error">("idle");

  useEffect(() => () => void call.current?.destroy(), []);

  const start = async () => {
    setState("joining");
    const Daily = (await import("@daily-co/daily-js")).default;
    if (!host.current) return;
    call.current?.destroy();
    const frame = Daily.createFrame(host.current, {
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      showLeaveButton: true,
    });
    call.current = frame;
    frame.on("left-meeting", () => setState("idle"));
    try {
      await frame.join({ url, token, startAudioOff: true, startVideoOff: false });
      setState("joined");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mt-6">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
        <li>Keep this phone on charge, on a stand or against something steady.</li>
        <li>Point it at your desk so your hands and keyboard are visible.</li>
        <li>Leave this page open until your interview ends.</li>
      </ol>
      {state !== "joined" && (
        <Button className="mt-5 w-full" onClick={start} disabled={state === "joining"}>
          {state === "joining" ? "Connecting…" : "Start phone camera"}
        </Button>
      )}
      {state === "error" && <p role="alert" className="mt-3 text-sm text-ink">Could not connect. Check the phone&rsquo;s internet and try again.</p>}
      <div ref={host} className="mt-5 aspect-[3/4] w-full bg-black" aria-label="Phone camera" />
    </div>
  );
}
