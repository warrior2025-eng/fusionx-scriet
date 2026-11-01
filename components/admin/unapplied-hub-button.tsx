"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectUnappliedHub } from "@/actions/admin-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toastResult } from "./toast";

/**
 * Selects a candidate in a hub they did not apply to: a required reason and,
 * when they hold other places, whether those stay. It can sit inside the
 * board's form, so it has no form of its own and keeps its typing to itself.
 */
export function UnappliedHubButton({
  cycleId,
  applicationId,
  name,
  teamId,
  hub,
  heldHubs,
  absent,
}: {
  cycleId: string;
  applicationId: string;
  name: string;
  teamId: string;
  hub: string;
  /** Other hubs this candidate is selected in now. */
  heldHubs: string[];
  absent: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const groupId = useId();
  const [reason, setReason] = useState("");
  const [keep, setKeep] = useState(true);
  const [pending, startTransition] = useTransition();
  const ready = reason.trim().length >= 3;

  function run() {
    startTransition(async () => {
      const result = await selectUnappliedHub(cycleId, applicationId, teamId, reason, keep);
      toastResult(result);
      if (result.status !== "success") return;
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.showModal()}>
        {hub} <span className="text-xs font-normal text-ink/60">Not applied</span>
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onChange={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        className="m-auto w-[min(92vw,28rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60"
      >
        <h2 id={titleId} className="font-serif text-xl">
          {name} did not apply to {hub}. Select them in {hub}?
        </h2>
        <label className="mt-4 block text-sm text-ink/80">
          Reason (required, kept in the audit log)
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            autoComplete="off"
            placeholder="Strong design skills seen in interview"
            className="mt-1.5"
          />
        </label>
        {absent && <p className="mt-2 text-xs text-ink/65">This candidate was absent from the interview. This reason also overrides the absent rule.</p>}
        {heldHubs.length > 0 && (
          <fieldset className="mt-4 space-y-2 text-sm">
            <legend className="mb-1 text-ink/80">They are selected in {heldHubs.join(" and ")}.</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name={groupId} checked={keep} onChange={() => setKeep(true)} className="h-4 w-4 accent-accent" />
              Keep their current hub(s) too
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={groupId} checked={!keep} onChange={() => setKeep(false)} className="h-4 w-4 accent-accent" />
              Move them to {hub} only
            </label>
          </fieldset>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!ready} loading={pending} onClick={run}>
            Select in {hub}
          </Button>
        </div>
      </dialog>
    </>
  );
}
