import { cn } from "@/lib/utils";

/**
 * Primary card / panel surface. One 45° clipped corner — always top-right —
 * echoing the cut edges of the logo's "X" (see `.cut-corner` in globals.css).
 * `interactive` adds the hover treatment: accent border and a 2px lift.
 * Not for buttons, inputs or small chips.
 */
export function CutCard({
  className,
  children,
  interactive,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "cut-corner h-full border border-line bg-surface/90 p-6 md:p-7",
        interactive && "cut-corner--interactive group",
        className,
      )}
    >
      {children}
    </div>
  );
}
