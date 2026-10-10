"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/admin/action-state";
import { cn } from "@/lib/utils";
import { toastResult } from "./toast";

type Confirm = {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** The user must type this exactly before the action can run. */
  typed?: string;
};

/**
 * A button that runs one server action and toasts the result. With `confirm`
 * it first opens a dialog (used for anything destructive); with
 * `confirm.typed` the confirmation has to be typed out.
 */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  danger,
  className,
  title,
  disabled,
  bare,
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  confirm?: Confirm;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  danger?: boolean;
  className?: string;
  /** Accessible name / tooltip, for icon-only buttons. */
  title?: string;
  disabled?: boolean;
  /** Icon-only styling: no border or padding beyond the hit area. */
  bare?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  function run() {
    dialogRef.current?.close();
    startTransition(async () => {
      const result = await action();
      toastResult(result);
      if (result.status === "success") router.refresh();
    });
  }

  const trigger = bare ? (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled || pending}
      onClick={() => (confirm ? dialogRef.current?.showModal() : run())}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink/65 transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35",
        danger && "hover:bg-red-500/10 hover:text-red-600",
        className,
      )}
    >
      {children}
    </button>
  ) : (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={pending}
      disabled={disabled}
      title={title}
      onClick={() => (confirm ? dialogRef.current?.showModal() : run())}
      className={cn(danger && "border-red-500/50 text-red-600 hover:border-red-500 hover:bg-red-500/10", className)}
    >
      {children}
    </Button>
  );

  if (!confirm) return trigger;

  return (
    <>
      {trigger}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setTyped("")}
        className="m-auto w-[min(92vw,26rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60"
      >
        <h2 id={titleId} className="font-serif text-xl">
          {confirm.title}
        </h2>
        {confirm.body && <p className="mt-2 text-sm leading-relaxed text-ink/75">{confirm.body}</p>}
        {confirm.typed && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm text-ink/80">
              Type <span className="font-semibold text-ink">{confirm.typed}</span> to confirm
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1.5"
              />
            </label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={confirm.typed ? typed !== confirm.typed : false}
            onClick={run}
            className={cn(danger && "bg-red-600 hover:bg-red-600/90 disabled:bg-red-600/40")}
          >
            {confirm.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
