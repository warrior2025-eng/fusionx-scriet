"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ActionState } from "@/lib/admin/action-state";

type Toast = { id: number; kind: "success" | "error"; message: string; href?: string };

const listeners = new Set<(toast: Toast) => void>();
let nextId = 0;

/** Shows a toast from anywhere in the admin UI. */
export function toast(kind: Toast["kind"], message: string, href?: string) {
  const item = { id: ++nextId, kind, message, href };
  listeners.forEach((listener) => listener(item));
}

/** Toasts the outcome of a server action, with a "View on site" link when it has one. */
export function toastResult(result: ActionState) {
  if (result.status === "idle" || !result.message) return;
  toast(result.status === "success" ? "success" : "error", result.message, result.viewHref);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const listener = (item: Toast) => {
      setToasts((current) => [...current.slice(-3), item]);
      const timer = setTimeout(
        () => {
          setToasts((current) => current.filter((t) => t.id !== item.id));
          timers.delete(timer);
        },
        item.kind === "error" ? 9000 : 6000,
      );
      timers.add(timer);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 border bg-surface px-4 py-3 text-sm text-ink shadow-lg sm:w-auto ${
            t.kind === "error" ? "border-red-500/60" : "border-accent/60"
          }`}
        >
          <span
            aria-hidden
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === "error" ? "bg-red-500" : "bg-accent"}`}
          />
          <div className="min-w-0 flex-1">
            <p>{t.message}</p>
            {t.href && (
              <Link href={t.href} target="_blank" className="mt-1 inline-block font-medium text-accent underline underline-offset-2">
                View on site
              </Link>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
            className="-mr-1 p-0.5 text-ink/50 hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
