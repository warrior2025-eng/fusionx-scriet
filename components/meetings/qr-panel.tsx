"use client";

import { useCallback, useEffect, useState } from "react";
import { makeMeetingQr } from "@/actions/meetings";
import { Button } from "@/components/ui/button";

type Code = { path: string; size: number; expiresAt: string };

/**
 * The QR for joining from a phone. Personal and short-lived: it works once, within 2
 * minutes, on a phone signed in to the same account. Nothing to copy or share.
 */
export function QrPanel({ meetingId, purpose }: { meetingId: string; purpose: "join" | "move" }) {
  const [code, setCode] = useState<Code | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(120);

  const refresh = useCallback(async () => {
    setError("");
    const made = await makeMeetingQr(meetingId, purpose);
    if ("error" in made) {
      setCode(null);
      setError(made.error);
    } else setCode(made);
  }, [meetingId, purpose]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);
  useEffect(() => {
    if (!code) return;
    const update = () => setLeft(Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 1000)));
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [code]);

  const expired = code && left === 0;
  return (
    <div className="text-center">
      <p className="text-sm text-ink/75">
        {purpose === "move" ? "Scan with the phone you want to move to. This window leaves when the phone joins." : "Scan with your phone. It must be signed in to this account."}
      </p>
      <div className="mx-auto mt-3 flex h-52 w-52 items-center justify-center bg-white p-2">
        {code && !expired ? (
          <svg viewBox={`0 0 ${code.size} ${code.size}`} className="h-full w-full" role="img" aria-label="A QR code to join on your phone" shapeRendering="crispEdges">
            <path d={code.path} fill="#00030D" />
          </svg>
        ) : (
          <span className="px-4 text-sm text-[#00030D]">{expired ? "This QR has expired." : error || "Making your QR…"}</span>
        )}
      </div>
      <p className="mt-2 text-xs text-ink/65">{code && !expired ? `Works once, for ${left} more seconds.` : ""}</p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void refresh()}>
        Refresh
      </Button>
    </div>
  );
}
