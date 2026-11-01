import { cn } from "@/lib/utils";
import type { ComponentProps, LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink mb-1.5", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/60",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/60",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors resize-y",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-surface px-3.5 py-2.5 text-sm text-ink",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** A field's own message. With an id of "<field id>-error" the field points at it. */
export function FieldError({ children, id }: { children?: string; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-ink/45">{children}</p>;
}
