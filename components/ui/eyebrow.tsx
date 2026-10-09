import { cn } from "@/lib/utils";
import { SlashMark } from "./slash-mark";

/**
 * Section / page eyebrow: the logo slash, then a plain sentence-case label.
 * With `index`, it also carries the section number and a hairline that runs
 * to the right edge of its container (used on the home page's major sections).
 */
export function Eyebrow({
  children,
  index,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-3 text-[13px] font-medium tracking-[0.08em] text-ink/70", className)}>
      <span className="flex items-center gap-2">
        <SlashMark />
        {index !== undefined && <span className="tabular-nums text-ink/45">{String(index).padStart(2, "0")}</span>}
        <span>{children}</span>
      </span>
      {index !== undefined && <span className="h-px flex-1 bg-line" aria-hidden />}
    </div>
  );
}
