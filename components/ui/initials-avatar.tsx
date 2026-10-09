import { cn } from "@/lib/utils";

/**
 * Initials in a navy disc with a 1px accent ring — the shape of the logo
 * badge. Navy and white in both themes, like the logo itself.
 */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00030D] text-sm font-semibold text-[#FEFEFE] ring-1 ring-accent",
        className,
      )}
    >
      {initials}
    </span>
  );
}
