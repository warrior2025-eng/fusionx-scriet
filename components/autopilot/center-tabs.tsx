"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, KanbanSquare, Library, SlidersHorizontal, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/command", label: "Today", icon: Inbox },
  { href: "/command/missions", label: "Missions", icon: KanbanSquare },
  { href: "/command/people", label: "People", icon: Users },
  { href: "/command/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/command/playbooks", label: "Playbooks", icon: Library },
  { href: "/command/outcomes", label: "Outcomes", icon: Trophy },
  { href: "/command/control", label: "Control", icon: SlidersHorizontal },
];

/** One row on every screen: icons with short labels on a phone, no sideways scroll. */
export function CenterTabs({ control }: { control: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => control || t.href !== "/command/control");
  return (
    <nav aria-label="Command Center" className="mt-5 border-b border-line">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/command" ? pathname === "/command" : pathname?.startsWith(href);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 px-0.5 py-2 text-[10.5px] font-medium sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
                  active ? "border-b-2 border-accent text-ink" : "border-b-2 border-transparent text-ink/65 hover:text-ink",
                )}
              >
                <Icon size={16} aria-hidden className="shrink-0" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
