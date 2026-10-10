"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Search, Bell, LayoutGrid, ChevronDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkButton } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
          <Link href="/profile" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            My Profile
          </Link>
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

export function SiteHeader({
  chapterName,
  subtitle,
  logoUrl,
  user,
}: {
  chapterName: string;
  subtitle: string;
  /** Uploaded logo; the built-in mark is used when this is empty. */
  logoUrl?: string | null;
  user: SiteUser | null;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "bg-surface border-b border-line"
          : "bg-surface border-b border-transparent"
      )}
    >
      <div className="container-fx flex h-16 items-center justify-between">
        {/* Logos & Brand */}
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          {/* College Official Logo */}
          <Link href="/" className="flex items-center shrink-0" aria-label="CCSU Meerut">
            <Image
              src="/ccsu-logo.webp"
              alt="Chaudhary Charan Singh University, Meerut"
              width={34}
              height={34}
              className="h-8 w-auto object-contain shrink-0"
            />
          </Link>

          {/* Elegant Divider */}
          <span className="h-6 w-px bg-ink/20" aria-hidden />

          {/* FusionX Official Logo & Name */}
          <Link href="/" className="flex items-center gap-2.5 group" onClick={() => setOpen(false)}>
            <Image
              src={logoUrl || "/logo-mark.png"}
              alt={`${chapterName} logo`}
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            {/* Never truncated: one line from sm up, two balanced lines on phones. */}
            <div className="flex flex-col justify-center">
              <span className="whitespace-nowrap font-semibold tracking-tight text-ink text-sm leading-tight">
                {chapterName}
              </span>
              <span className="mt-0.5 max-w-[8.5rem] text-balance text-[10.5px] leading-[1.2] text-ink/65 sm:max-w-none sm:whitespace-nowrap sm:text-[11px]">
                {subtitle}
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden xl:flex items-center gap-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative whitespace-nowrap px-2 py-1.5 text-[13px] font-medium rounded-sm transition-colors duration-150",
                pathname?.startsWith(item.href)
                  ? "text-ink font-semibold"
                  : "text-ink/65 hover:text-ink hover:bg-ink/5"
              )}
            >
              {item.label}
              {pathname?.startsWith(item.href) && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent" />
              )}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden xl:flex shrink-0 items-center gap-1">
          <Link href="/search" aria-label="Search" className="p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
            <Search size={16} />
          </Link>
          <ThemeToggle className="p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5" />
          {user ? (
            <>
              <Link href="/notifications" aria-label="Notifications" className="p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
                <Bell size={16} />
              </Link>
              <Link href="/projects/mine" aria-label="My projects" className="p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
                <LayoutGrid size={16} />
              </Link>
              <ProfileMenu user={user} />
            </>
          ) : (
            <Link href="/login" className="whitespace-nowrap text-[13px] font-medium text-ink/70 hover:text-ink transition-colors px-3 py-1.5">
              Sign in
            </Link>
          )}
          <LinkButton href="/join" size="sm" className="ml-1">
            Join <ArrowRight size={14} />
          </LinkButton>
        </div>

        {/* Mobile toggle */}
        <button
          className="xl:hidden p-2 -mr-2 text-ink"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {open && (
        <nav className="xl:hidden border-t border-ink/10 bg-paper px-6 py-4 flex flex-col gap-1">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-ink/10">
            <span className="text-sm text-ink/65">Theme</span>
            <ThemeToggle className="p-1.5 rounded-full border border-ink/15 text-ink/70 hover:text-ink" />
          </div>
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
              className={cn(
                "py-2.5 text-sm border-b border-ink/5 last:border-0 transition-colors",
                pathname?.startsWith(item.href)
                  ? "text-accent font-medium"
                  : "text-ink/75 hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          ))}
          {user && (
            <>
              <Link href="/profile" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                My Profile
              </Link>
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
