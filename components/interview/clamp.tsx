"use client";

import { useEffect, useRef, useState } from "react";

/** A long answer, clamped to 3 lines with "Show more" (only when it is longer than that). */
export function Clamp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = window.setTimeout(() => setLong(el.scrollHeight > el.clientHeight + 2), 0);
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <div>
      <p ref={ref} className={open ? "whitespace-pre-line text-ink" : "line-clamp-3 whitespace-pre-line text-ink"}>
        {text}
      </p>
      {(long || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-accent-text underline underline-offset-2">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
