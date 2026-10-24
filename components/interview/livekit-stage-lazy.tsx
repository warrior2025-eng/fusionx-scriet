"use client";

import dynamic from "next/dynamic";

/**
 * The video call, loaded only when a call opens (the LiveKit SDK is large): the
 * device check, the waiting room and the panel's sidebar show without waiting for it.
 */
export const LiveKitStage = dynamic(() => import("@/components/interview/livekit-stage").then((m) => m.LiveKitStage), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-black text-sm text-white/80">Opening the video…</div>,
});
