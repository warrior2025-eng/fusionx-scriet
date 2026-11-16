"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A closed-by-default section of My work: its title and a one-line summary (a count or a deadline), opened with a tap.
 * It opens by itself when the page link points at it (for example /my-work#pitches).
 */
export function Fold({ id, title, summary, open = false, children }: { id: string; title: string; summary?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const sync = () => { if (window.location.hash === `#${id}` && ref.current) ref.current.open = true; };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);
  return (
    <details ref={ref} id={id} open={open} className="group scroll-mt-24 border border-line bg-surface" data-fold={id}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-serif text-lg text-ink">{title}</span>
          {summary && <span className="block text-xs text-ink/65">{summary}</span>}
        </span>
        <ChevronDown size={18} className="shrink-0 text-ink/60 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}
