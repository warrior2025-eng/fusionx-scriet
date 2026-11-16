"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cancelJoin, joinProject, leaveProject } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

/**
 * Joining a project team needs the owner's Accept (migration 0049):
 *   "Ask to join" → "Requested · waiting for the owner" (Cancel) → once accepted: "You're in" (Open, Leave).
 * Signed out: sign in first. The owner sees "Your project".
 */
export function JoinProject({ id, signedIn, label = "Ask to join", ariaLabel, joined = false, owner = false, requested = false }: {
  id: string; signedIn: boolean; label?: string; ariaLabel?: string; joined?: boolean; owner?: boolean; requested?: boolean;
}) {
  const { pending, run } = useRun();
  if (!signedIn) return <Link href={`/login?next=/projects`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">Sign in to ask to join</Link>;
  if (owner) return <Link href={`/projects/${id}/work`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline" data-your-project>Your project</Link>;
  if (joined) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-joined>
        <Link href={`/projects/${id}/work`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">You&apos;re in · Open</Link>
        <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} data-leave-project
          onClick={() => { if (window.confirm("Leave this team? Your open tasks in it will be unassigned.")) run(() => leaveProject(id)); }}>
          Leave
        </Button>
      </span>
    );
  }
  if (requested) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-requested>
        <span className="text-sm text-ink/75">Requested · waiting for the owner</span>
        <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(() => cancelJoin(id))} data-cancel-request>Cancel</Button>
      </span>
    );
  }
  return <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => joinProject(id))} aria-label={ariaLabel} data-join-project>{label}</Button>;
}
