"use client";

import { useTransition } from "react";
import { toggleMentorPublished, deleteMentor } from "@/actions/mentors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MentorRow({
  id,
  name,
  roleTitle,
  isPublished,
}: {
  id: string;
  name: string;
  roleTitle: string;
  isPublished: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="border border-ink/10 rounded-sm p-4 bg-surface flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink">{name}</p>
        <p className="text-xs text-ink/45">{roleTitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge>{isPublished ? "published" : "draft"}</Badge>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => startTransition(() => toggleMentorPublished(id, !isPublished))}
        >
          {isPublished ? "Unpublish" : "Publish"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pending}
          className="text-red-500 hover:bg-red-500/10"
          onClick={() => {
            if (confirm("Delete this mentor permanently?")) startTransition(() => deleteMentor(id));
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
