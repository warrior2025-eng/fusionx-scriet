"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { joinProject } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

/** "Join this project": into the project team (project_members), or sign in first. */
export function JoinProject({ id, signedIn, label = "Join this project", ariaLabel }: { id: string; signedIn: boolean; label?: string; ariaLabel?: string }) {
  const { pending, run } = useRun();
  if (!signedIn) return <Link href={`/login?next=/projects`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">Sign in to join</Link>;
  return <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => joinProject(id))} aria-label={ariaLabel} data-join-project>{label}</Button>;
}
