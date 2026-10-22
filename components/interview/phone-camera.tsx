"use client";

import { useState } from "react";
import { LiveKitStage } from "@/components/interview/livekit-stage";
import { Button } from "@/components/ui/button";

/**
 * The phone's camera in the interview room: camera only, microphone off (the
 * token cannot send audio), no sound played. The candidate places the phone
 * to show their desk and hands.
 */
export function PhoneCamera({ serverUrl, token }: { serverUrl: string; token: string }) {
  const [state, setState] = useState<"idle" | "on" | "error">("idle");

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
      {state === "on" && (
        <div className="mt-5 aspect-[3/4] w-full bg-black" aria-label="Phone camera">
          <LiveKitStage serverUrl={serverUrl} token={token} mode="phone" onDisconnected={() => setState("idle")} onError={() => setState("error")} />
        </div>
      )}
    </div>
  );
}
