"use client";

import { useState, useTransition } from "react";
import { joinTeam, leaveTeam } from "@/actions/teams";
import { Button } from "@/components/ui/button";

export function TeamJoinButton({
  teamId,
  isMember,
  isOpen = true,
}: {
  teamId: string;
  isMember: boolean;
  /** False once a team is completed or archived: nobody new can join. */
  isOpen?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isMember && !isOpen) return <span className="text-sm text-ink/55">Not taking new members</span>;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant={isMember ? "secondary" : "primary"}
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await (isMember ? leaveTeam(teamId) : joinTeam(teamId));
            setError(result.error ?? null);
          })
        }
      >
        {isMember ? "Leave" : "Join"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
