import { cn } from "@/lib/utils";

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-ink/15 px-2.5 py-0.5 text-xs font-medium text-ink/70",
        className
      )}
    >
      {children}
    </span>
  );
}
