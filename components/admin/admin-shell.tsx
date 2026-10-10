"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderKanban,
  Handshake,
  Images,
  Inbox,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  Menu,
  Microscope,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  TriangleAlert,
  UserCog,
  Users,
  UsersRound,
  X,
  Trophy,
} from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { Toaster } from "./toast";

const ICONS = {
  overview: LayoutDashboard,
  team: UsersRound,
  content: FileText,
  programs: Layers,
  events: CalendarDays,
  opportunities: Trophy,
  resources: Library,
  announcements: Megaphone,
  mentors: Handshake,
  projects: FolderKanban,
  research: Microscope,
  teams: Users,
  applications: ClipboardList,
  users: UserCog,
  messages: Inbox,
  notifications: Bell,
  media: Images,
  audit: ScrollText,
  settings: Settings,
  danger: TriangleAlert,
} as const;

export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS };
export type AdminNavGroup = { heading: string; items: AdminNavItem[] };

const STORAGE_KEY = "admin-sidebar";
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
};
function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "open");
  } catch {}
  listeners.forEach((l) => l());
}

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({
  groups,
  pathname,
  collapsed,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.heading}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
              {group.heading}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors duration-150",
                      collapsed && "justify-center px-0",
                      active ? "bg-accent-soft font-medium text-ink" : "text-ink/70 hover:bg-ink/5 hover:text-ink",
                    )}
                  >
                    <Icon size={17} className="shrink-0" aria-hidden />
                    {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The admin frame: a sidebar that collapses to icons on desktop (remembered
 * per browser), a slide-over menu on small screens, and the toaster. The nav
 * it is given already contains only what the current role may use.
 */
export function AdminShell({
  groups,
  userName,
  roleLabel,
  siteName,
  children,
}: {
  groups: AdminNavGroup[];
  userName: string;
  roleLabel: string;
  siteName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [menuOpen, setMenuOpen] = useState(false);

  const account = (compact?: boolean) => (
    <div className={cn("border-t border-line p-3", compact && "px-2")}>
      {!compact && (
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-medium text-ink">{userName}</p>
          <p className="text-xs text-ink/55">{roleLabel}</p>
        </div>
      )}
      <Link
        href="/"
        className={cn(
          "flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink",
          compact && "justify-center px-0",
        )}
        title={compact ? "View site" : undefined}
      >
        <ExternalLink size={16} aria-hidden />
        {compact ? <span className="sr-only">View site</span> : "View site"}
      </Link>
      {!compact && (
        <form action={logoutAction}>
          <button className="w-full rounded-sm px-3 py-2 text-left text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            Sign out
          </button>
        </form>
      )}
    </div>
  );

  const brand = (compact?: boolean) => (
    <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
      <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-ink">{siteName}</span>
          <span className="block text-[11px] leading-tight text-ink/55">Admin</span>
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.25rem]" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-line px-4", collapsed && "justify-center px-0")}>
          {brand(collapsed)}
        </div>
        <Nav groups={groups} pathname={pathname} collapsed={collapsed} />
        {account(collapsed)}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            className="-ml-2 p-2 text-ink lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <button
            type="button"
            className="-ml-2 hidden p-2 text-ink/65 hover:text-ink lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={() => writeCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="lg:hidden">{brand()}</div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="p-2 text-ink/65 hover:text-ink" />
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10">{children}</div>
        </main>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              {brand()}
              <button type="button" aria-label="Close menu" className="p-2 text-ink" onClick={() => setMenuOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <Nav groups={groups} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            {account()}
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
