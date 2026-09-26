"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Search, Bell, LayoutGrid, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkButton } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";

const nav = [
  { href: "/about", label: "About" },
  { href: "/programs", label: "Programs" },
  { href: "/projects", label: "Projects" },
  { href: "/research", label: "Research" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/events", label: "Events" },
  { href: "/founders", label: "Team" },
];

type SiteUser = { email: string; fullName: string; avatarUrl: string | null };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ProfileMenu({ user }: { user: SiteUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-ink/5 transition-colors"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.fullName} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
            {initials(user.fullName)}
          </span>
        )}
        <ChevronDown size={14} className={cn("text-ink/50 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-sm border border-ink/10 bg-paper shadow-lg py-2 z-50">
          <div className="px-3.5 py-2 border-b border-ink/10">
            <p className="text-sm font-medium text-ink truncate">{user.fullName}</p>
            <p className="text-xs text-ink/45 truncate">{user.email}</p>
          </div>
          <Link href="/projects/mine" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            My Projects
          </Link>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            Notifications
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="w-full text-left px-3.5 py-2 text-sm text-red-500 hover:bg-red-500/10">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ chapterName, user }: { chapterName: string; user: SiteUser | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
      <div className="container-fx flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink" onClick={() => setOpen(false)}>
          <Image src="/logo-mark.png" alt="FusionX logo" width={28} height={28} className="h-7 w-7 rounded-full" />
          <span className="hidden sm:inline">{chapterName}</span>
          <span className="sm:hidden">FusionX</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-ink/65 hover:text-ink transition-colors",
                pathname?.startsWith(item.href) && "text-ink font-medium"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/search" aria-label="Search" className="p-2 text-ink/65 hover:text-ink transition-colors">
            <Search size={18} />
          </Link>
          {user ? (
            <>
              <Link href="/notifications" aria-label="Notifications" className="p-2 text-ink/65 hover:text-ink transition-colors">
                <Bell size={18} />
              </Link>
              <Link href="/projects/mine" aria-label="My projects" className="p-2 text-ink/65 hover:text-ink transition-colors">
                <LayoutGrid size={18} />
              </Link>
              <ProfileMenu user={user} />
            </>
          ) : (
            <Link href="/login" className="text-sm text-ink/65 hover:text-ink transition-colors">
              Sign in
            </Link>
          )}
          <LinkButton href="/join" size="sm">
            Join FusionX
          </LinkButton>
        </div>

        <button
          className="md:hidden p-2 -mr-2 text-ink"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-ink/10 bg-paper px-6 py-4 flex flex-col gap-1">
          {user && (
            <div className="flex items-center gap-2.5 pb-3 mb-2 border-b border-ink/10">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.fullName} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {initials(user.fullName)}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{user.fullName}</p>
                <p className="text-xs text-ink/45 truncate">{user.email}</p>
              </div>
            </div>
          )}
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5 last:border-0"
            >
              {item.label}
            </Link>
          ))}
          {user && (
            <>
              <Link href="/notifications" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                Notifications
              </Link>
              <Link href="/projects/mine" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                My Projects
              </Link>
            </>
          )}
          <div className="flex gap-3 pt-4">
            {user ? (
              <form action={logoutAction} className="flex-1">
                <button type="submit" className="w-full text-center rounded-sm border border-ink/20 py-2.5 text-sm font-medium text-ink hover:border-ink/50">
                  Sign out
                </button>
              </form>
            ) : (
              <LinkButton href="/login" variant="secondary" size="sm" className="flex-1">
                Sign in
              </LinkButton>
            )}
            <LinkButton href="/join" size="sm" className="flex-1">
              Join FusionX
            </LinkButton>
          </div>
        </nav>
      )}
    </header>
  );
}
