"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cancelProject } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

/** "Cancel this project": the owner of a project started from an idea, in its first 4 days (migration 0051). */
export function CancelProject({ projectId, until }: { projectId: string; until: string }) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  return (
    <section className="border border-line bg-surface p-4" data-cancel-project>
      <h2 className="font-serif text-lg text-ink">Changed your mind?</h2>
      <p className="mt-1 text-sm text-ink/70">You can cancel this project until <strong className="text-ink">{until}</strong>. The idea stays in Ideas for you, so you or anyone can start it later.</p>
      <Button variant="secondary" className="mt-3 min-h-11 text-red-700 dark:text-red-400" onClick={() => dialog.current?.showModal()} data-open-cancel>Cancel this project</Button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,440px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h3 className="font-serif text-xl">Cancel this project?</h3>
        <p className="mt-1 text-sm text-ink/70">It leaves Projects. Anyone in the team is told and leaves the team. This cannot be undone by you.</p>
        <label className="mt-3 block text-sm">Why (optional, shown to the team)
          <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-h-11" placeholder="e.g. Exams this month" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" onClick={() => dialog.current?.close()}>Keep it</Button>
          <Button className="min-h-11" disabled={pending} onClick={() => run(() => cancelProject(projectId, reason), () => dialog.current?.close())} data-confirm-cancel>Cancel project</Button>
        </div>
      </dialog>
    </section>
  );
}
