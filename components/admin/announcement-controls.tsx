"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAnnouncementStatus, deleteAnnouncementAsAdmin } from "@/actions/admin-moderation";
import type { AnnouncementStatus } from "@/types/database";

export function AnnouncementControls({ id, status }: { id: string; status: AnnouncementStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 shrink-0">
      {status !== "published" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => startTransition(() => setAnnouncementStatus(id, "published"))}
        >
          Publish
        </Button>
      )}
      {status === "published" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => startTransition(() => setAnnouncementStatus(id, "archived"))}
        >
          Archive
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={pending}
        className="text-red-500 hover:bg-red-500/10"
        onClick={() => {
          if (confirm("Delete this permanently? This can't be undone.")) {
            startTransition(() => deleteAnnouncementAsAdmin(id));
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}
