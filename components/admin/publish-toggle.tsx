"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function PublishToggle({
  isPublished,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  isPublished: boolean;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => startTransition(isPublished ? onUnpublish : onPublish)}
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
          if (confirm("Delete this permanently? This can't be undone.")) {
            startTransition(onDelete);
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}