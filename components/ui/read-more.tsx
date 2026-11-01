"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Text that is clamped to a few lines with a "Read more" toggle when it is long. */
export function ReadMore({ text, limit = 220, lines = 4, className }: { text: string; limit?: number; lines?: 2 | 3 | 4; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const long = text.length > limit || (lines < 4 && text.includes("\n"));

  return (
    <div className={className}>
      <p id={id} className={cn("whitespace-pre-line text-sm leading-relaxed text-ink/75", long && !open && (lines === 2 ? "line-clamp-2" : lines === 3 ? "line-clamp-3" : "line-clamp-4"))}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-sm font-medium text-accent underline underline-offset-2"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
