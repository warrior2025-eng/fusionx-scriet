"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Send } from "lucide-react";
import { setActionDone } from "@/actions/meetings";
import { Button } from "@/components/ui/button";

/** A done checkbox for an action item (its owner, or a host). */
export function ActionCheck({ id, done, label }: { id: string; done: boolean; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState("");
  return (
    <>
      <input
        type="checkbox"
        defaultChecked={done}
        disabled={pending}
        aria-label={`Done: ${label}`}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            const result = await setActionDone(id, next);
            setProblem(result.ok ? "" : result.error);
            router.refresh();
          });
        }}
      />
      {problem && <span className="text-xs text-red-600">{problem}</span>}
    </>
  );
}

/** Lets a call show as a browser notification when this tab is in the background. */
export function CallAlerts() {
  const [state, setState] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    const first = window.setTimeout(() => setState("Notification" in window ? Notification.permission : "none"), 0);
    return () => window.clearTimeout(first);
  }, []);
  if (state !== "default") return null;
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void Notification.requestPermission().then(setState)}>
      <Bell size={14} aria-hidden /> Turn on call alerts
    </Button>
  );
}

/** "Send minutes to invitees", for a host. */
export function SendMinutes({ meetingId }: { meetingId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await fetch(`/api/meetings/${meetingId}/host`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_minutes", args: {} }) });
            const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
            setMessage(res.ok ? `Sent to ${body.sent ?? 0} people.` : (body.error ?? "That could not be sent."));
          })
        }
      >
        <Send size={14} aria-hidden /> Send minutes to invitees
      </Button>
      <span role="status" className="text-sm text-ink/70">
        {message}
      </span>
    </span>
  );
}
