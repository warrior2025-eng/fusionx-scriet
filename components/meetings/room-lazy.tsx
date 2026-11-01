"use client";

import dynamic from "next/dynamic";

/** The room, loaded only when someone enters (the LiveKit SDK is large). */
export const MeetingRoom = dynamic(() => import("@/components/meetings/meeting-room").then((m) => m.MeetingRoom), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#00030D] text-sm text-white/80">Opening the meeting…</div>,
});
