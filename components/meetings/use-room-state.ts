"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoomChat, RoomState } from "@/lib/meetings/shared";

const EVERY_MS = 3000;

/**
 * The room's shared state, read from the database every few seconds (which also
 * counts as this person's check-in for attendance). A note on the LiveKit data
 * channel makes everyone read it at once, so changes feel instant, but nothing is
 * decided from those notes: rights and content always come from here.
 */
export function useRoomState(meetingId: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const chat = useRef(new Map<string, RoomChat>());
  const after = useRef<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const { data, error } = await createClient().rpc("meeting_room_state", { p_meeting: meetingId, p_in_room: true, p_chat_after: after.current });
      if (error || !data) return;
      const next = data as RoomState;
      for (const message of next.chat) chat.current.set(message.id, message);
      // A few seconds back, so a message written while this was being read is not missed.
      after.current = new Date(new Date(next.now).getTime() - 8000).toISOString();
      setState({ ...next, chat: [...chat.current.values()].sort((a, b) => a.at.localeCompare(b.at)) });
    } finally {
      running.current = false;
    }
  }, [meetingId]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  /** Every host action goes to the server, which checks the rights first. Null when it worked, else the reason. */
  const host = useCallback(
    async (action: string, args: Record<string, unknown> = {}): Promise<string | null> => {
      const res = await fetch(`/api/meetings/${meetingId}/host`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, args }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return body.error ?? "That could not be done.";
      }
      void refresh();
      return null;
    },
    [meetingId, refresh],
  );

  return { state, refresh, host };
}
