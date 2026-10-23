"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Video } from "lucide-react";
import { dayRoomStatus, enforceDayRoom } from "@/actions/interview-panel";
import { Pill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { slotTime } from "@/lib/recruitment/slots";

type Status = { live: boolean; panel: number; candidates: number; phones: number; lastRun: string | null; removedTotal: number };

/**
 * "Room status" for an interview day (admins): whether the room is live, who
 * is in it, the last automatic clean-up, and a button to run it now.
 * Refreshed every 15 seconds while the page is open.
 */
export function RoomStatus({ dayId }: { dayId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await dayRoomStatus(dayId).catch(() => null);
    if (res?.ok) {
      setStatus(res);
      setMessage("");
    } else setMessage(res?.message ?? "Could not read the room.");
  }, [dayId]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const clean = async () => {
    setBusy(true);
    const res = await enforceDayRoom(dayId).catch(() => null);
    setBusy(false);
    setDone(res?.ok ? `Done: ${res.removed} removed.` : (res?.message ?? "Could not check the room."));
    void load();
  };

  return (
    <div className="mt-6 border border-line p-4">
      <h3 className="text-sm font-semibold text-ink">Room status</h3>
      {status ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="text-ink/70">Room</dt>
            <dd>{status.live ? <Pill tone="good">Live</Pill> : <Pill>Not live (nobody in it)</Pill>}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink/70">Panel members connected</dt>
            <dd className="tabular-nums text-ink">{status.panel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink/70">Candidates connected now</dt>
            <dd className="tabular-nums text-ink">
              {status.candidates}
              {status.phones > 0 && ` (+${status.phones} phone camera${status.phones === 1 ? "" : "s"})`}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink/70">Last clean-up</dt>
            <dd className="text-ink">
              {status.lastRun ? `${slotTime(status.lastRun)}, ${status.removedTotal} removed today` : "Not run yet"}
            </dd>
          </div>
        </dl>
      ) : (
        !message && <p className="mt-2 text-sm text-ink/70">Reading the room…</p>
      )}
      {(message || done) && (
        <p className="mt-2 text-sm text-ink" role="status">
          {message || done}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={busy} onClick={clean}>
          <RefreshCw size={14} aria-hidden /> {busy ? "Checking…" : "Remove everyone whose slot has ended"}
        </Button>
        <Link href={`/admin/interviews/day/${dayId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-2">
          <Video size={14} aria-hidden /> Open the interview room
        </Link>
      </div>
    </div>
  );
}
