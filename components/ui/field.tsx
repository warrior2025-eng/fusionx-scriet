import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink mb-1.5", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors resize-y",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-sm border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink",
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-ink/45">{children}</p>;
}
