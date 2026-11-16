"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { joinProject, leaveProject } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

/**
 * "Join this project": into the project team (project_members), or sign in first.
 * Once you are in the team: "You're in" with a link to the team's work page, and Leave (migration 0048).
 */
export function JoinProject({ id, signedIn, label = "Join this project", ariaLabel, joined = false, owner = false }: {
  id: string; signedIn: boolean; label?: string; ariaLabel?: string; joined?: boolean; owner?: boolean;
}) {
  const { pending, run } = useRun();
  if (!signedIn) return <Link href={`/login?next=/projects`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">Sign in to join</Link>;
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
  return <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => joinProject(id))} aria-label={ariaLabel} data-join-project>{label}</Button>;
}
