"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed } from "lucide-react";
import { knock } from "@/actions/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

type KnockState = { status: "pending" | "let_in" | "not_now"; count: number } | null;

/** For someone signed in who has no pass: knock, with an optional line. Nothing else of the meeting opens. */
export function KnockPanel({ meetingId, title, open, last }: { meetingId: string; title: string; open: boolean; last: KnockState }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const waiting = last?.status === "pending";

  // While waiting: being let in takes them straight in; "not now" shows here.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(async () => {
      const { data } = await createClient().rpc("meeting_view", { p_meeting: meetingId, p_for: null });
      const view = data as { allowed?: boolean; knock?: { status?: string } } | null;
      if (view?.allowed) router.replace(`/meetings/${meetingId}?enter=direct`);
      else if (view?.knock?.status !== "pending") router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting, router, meetingId]);

  const send = (meetingNote: string) =>
    startTransition(async () => {
      const result = await knock(meetingId, meetingNote);
      if (!result.ok) setError(result.error);
      else {
        setError("");
        router.refresh();
      }
    });

  return (
    <div className="mx-auto max-w-md border border-line bg-surface p-8">
      <DoorClosed size={22} className="text-accent-text" aria-hidden />
      <h1 className="mt-3 font-serif text-2xl text-ink">{title}</h1>
      {waiting ? (
        <p className="mt-3 text-sm text-ink/75">Waiting for the host to let you in. You will enter by yourself.</p>
      ) : !open ? (
        <p className="mt-3 text-sm text-ink/75">You are not invited to this meeting. You can knock once its doors are open.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink/75">You are not invited to this meeting. A host can let you in.</p>
          {last?.status === "not_now" && <p className="mt-2 text-sm text-ink/75">The host said not now.</p>}
          <label className="mt-4 block text-sm text-ink/80">
            A line for the host (optional)
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} autoComplete="off" className="mt-1.5" />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <Button className="mt-4 w-full" loading={pending} onClick={() => send(note)}>
            Knock to enter
          </Button>
        </>
      )}
    </div>
  );
}
