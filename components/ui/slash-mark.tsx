import { cn } from "@/lib/utils";

/**
 * The site's one accent mark: the electric-blue slash from the FusionX logo.
 * Measured off /public/logo-mark.png — it rises at 45° and is about 4.5 times
 * as long as it is thick — and drawn here with the same angle and proportion.
 * Decorative; sized by font-size (1em tall) so it sits on a line of text.
 */
export function SlashMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      className={cn("slash-mark inline-block h-[1em] w-[1em] shrink-0 text-accent", className)}
    >
      {/* 45° bar, 17 long × 3.8 thick, centred in the box */}
      <rect x="-0.5" y="6.1" width="17" height="3.8" fill="currentColor" transform="rotate(-45 8 8)" />
    </svg>
  );
}
