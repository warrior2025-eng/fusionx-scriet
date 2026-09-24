"use client";

import { useTransition } from "react";
import { joinTeam, leaveTeam } from "@/actions/teams";
import { Button } from "@/components/ui/button";

export function TeamJoinButton({ teamId, isMember }: { teamId: string; isMember: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={isMember ? "secondary" : "primary"}
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => (isMember ? leaveTeam(teamId) : joinTeam(teamId)))}
    >
      {isMember ? "Leave" : "Join"}
    </Button>
  );
}