"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { decideJoin, leaveProject, removeProjectMember, setProjectJoins } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

/**
 * The project team on its work page. Everyone in the team sees who is in it. The owner can stop or allow
 * new joins and remove a member (migration 0049); a member can leave (migration 0048).
 */
export function TeamPanel({ projectId, team, ownerId, me, joinable, joinsClosed, requests = [] }: {
  projectId: string; team: { id: string; name: string }[]; ownerId: string; me: string; joinable: boolean; joinsClosed: boolean;
  requests?: { id: string; name: string; detail: string }[];
}) {
  const { pending, run } = useRun();
  const owner = me === ownerId;
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  return (
    <section className="border border-line bg-surface p-4" data-team-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Team ({team.length})</h2>
        {joinable && <span className="text-xs text-ink/65" data-joins-state>{joinsClosed ? "Not taking new members" : "Open to new members"}</span>}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {team.map((m) => (
          <li key={m.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2" data-team-member>
            <span className="text-sm text-ink">{m.name}{m.id === ownerId ? " · owner" : ""}{m.id === me ? " (you)" : ""}</span>
            {owner && m.id !== ownerId && (
              <Button size="sm" variant="ghost" className="min-h-11 text-red-700 dark:text-red-400" disabled={pending} aria-label={`Remove ${m.name} from the team`}
                onClick={() => { setTarget(m); setReason(""); dialog.current?.showModal(); }} data-remove-member>
                Remove
              </Button>
            )}
            {!owner && m.id === me && (
              <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} data-leave-project
                onClick={() => { if (window.confirm("Leave this team? Your open tasks in it will be unassigned.")) run(() => leaveProject(projectId)); }}>
                Leave
              </Button>
            )}
          </li>
        ))}
      </ul>
      {owner && requests.length > 0 && (
        <div className="mt-4 border-2 border-accent bg-accent/5 p-3" data-join-requests>
          <h3 className="font-semibold text-ink">Asking to join ({requests.length})</h3>
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2" data-join-request>
                <span className="min-w-0 text-sm"><strong className="text-ink">{r.name}</strong>{r.detail ? <span className="text-ink/65"> · {r.detail}</span> : null}</span>
                <span className="flex gap-2">
                  <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => decideJoin(projectId, r.id, true))} aria-label={`Accept ${r.name}`} data-accept-join>Accept</Button>
                  <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => decideJoin(projectId, r.id, false))} aria-label={`Decline ${r.name}`} data-decline-join>Decline</Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {owner && joinable && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => setProjectJoins(projectId, !joinsClosed))} data-toggle-joins>
            {joinsClosed ? "Allow new joins" : "Stop new joins"}
          </Button>
          <p className="text-xs text-ink/60">{joinsClosed ? "Nobody new can join. The team stays as it is." : "Members can join from the Projects page until the team is full."}</p>
        </div>
      )}
      <dialog ref={dialog} className="m-auto w-[min(92vw,440px)] border border-line bg-paper p-5 text-ink backdrop:bg-black/50">
        <h3 className="font-serif text-xl">Remove {target?.name}?</h3>
        <p className="mt-1 text-sm text-ink/70">Their open tasks in this project become unassigned, and they get a notification.</p>
        <label className="mt-3 block text-sm">A short note for them (optional)
          <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We need someone who can join the weekly calls" className="min-h-11" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button className="min-h-11" disabled={pending || !target} data-confirm-remove
            onClick={() => target && run(() => removeProjectMember(projectId, target.id, reason), () => dialog.current?.close())}>
            Remove
          </Button>
        </div>
      </dialog>
    </section>
  );
}
