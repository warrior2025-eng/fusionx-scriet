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
import { CandidateEntryButton, ReviewerLiveButton } from "@/components/recruitment/candidate-entry";
import type { CandidateEntry } from "@/lib/recruitment/entry-stage";
import type { LiveDay } from "@/lib/recruitment/my-entry";

/*
 * Three layouts, by what fits (measured; the header row is up to 90rem wide):
 *  - wide (1440px+): every link, every action
 *  - lg to wide (1024-1439px): the most used links, the rest under "More";
 *    notifications and my projects are in the account menu, and below xl
 *    search moves under "More" too
 *  - below lg: the menu button and the full list
 * The brand never shrinks and keeps a 32px gap before the links.
 */
type NavItem = { href: string; label: string; badge?: string };

/** Under "More" between lg and wide. */
const MORE = new Set(["/about", "/projects", "/research", "/opportunities"]);

const nav: NavItem[] = [
  { href: "/about", label: "About" },
  { href: "/hubs", label: "FusionX Hubs" },
  { href: "/projects", label: "Projects" },
  { href: "/research", label: "Research" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/events", label: "Events" },
  { href: "/core", label: "Core" },
];

type SiteUser = {
  email: string;
  fullName: string;
  avatarUrl: string | null;
  /** Staff and faculty panels this person may open. Empty for members. */
  panels: { href: string; label: string }[];
  /** A candidate with an interview booking: "My Interview" / "My Application" / "My Result". */
  candidate?: CandidateEntry | null;
  /** A reviewer while today's interviews are on: "Reviewer panel · Live". */
  reviewerLive?: LiveDay | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1.5 py-1.5 text-[13px] font-medium transition-colors duration-150 xl:px-2",
        active ? "text-ink font-semibold" : "text-ink/65 hover:text-ink hover:bg-ink/5",
      )}
    >
      {item.label}
      {item.badge && <span className="ml-1 bg-accent px-1 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span>}
      {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent" />}
    </Link>
  );
}

/** The links that do not fit between lg and wide. A button that opens a list; Escape or a click outside closes it. */
function MoreMenu({ items, isActive }: { items: NavItem[]; isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const active = items.some((i) => isActive(i.href));

  // Closed again after navigating.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="nav-more"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-1.5 text-[13px] font-medium transition-colors duration-150 xl:px-2",
          active ? "text-ink font-semibold" : "text-ink/65 hover:text-ink hover:bg-ink/5",
        )}
      >
        More
        <ChevronDown size={14} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent" />}
      </button>
      {open && (
        <ul id="nav-more" className="absolute left-0 top-full z-50 mt-2 w-48 rounded-sm border border-line bg-paper py-2 shadow-lg">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-3.5 py-2 text-sm hover:bg-ink/5",
                  isActive(item.href) ? "font-semibold text-ink" : "text-ink/75 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
          {/* The search icon is not in the row below xl. */}
          <li className="mt-1 border-t border-line pt-1 xl:hidden">
            <Link href="/search" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3.5 py-2 text-sm text-ink/75 hover:bg-ink/5 hover:text-ink">
              <Search size={14} aria-hidden /> Search
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
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
          {user.candidate && <CandidateEntryButton entry={user.candidate} place="menu" onNavigate={() => setOpen(false)} />}
          {user.panels.map((panel) => (
            <Link
              key={panel.href}
              href={panel.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 text-sm font-medium hover:bg-ink/5",
                panel.label === "Reviewer panel" && user.reviewerLive ? "font-semibold text-accent-text" : "text-ink",
              )}
            >
              {panel.label}
              {panel.label === "Reviewer panel" && user.reviewerLive && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-sm bg-[#004df6] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden /> Live
                </span>
              )}
            </Link>
          ))}
          <Link href="/profile" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            My Profile
          </Link>
          <Link href="/profile/events" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink">
            My Events
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
  recruitment,
}: {
  chapterName: string;
  subtitle: string;
  /** Uploaded logo; the built-in mark is used when this is empty. */
  logoUrl?: string | null;
  user: SiteUser | null;
  /** Adds the Recruitment link (decided in the admin panel), with an "Open" or "Results" badge. */
  recruitment?: { badge: string | null; href: string } | null;
}) {
  const links: NavItem[] = recruitment
    ? [...nav, { href: recruitment.href, label: "Recruitment", badge: recruitment.badge ?? undefined }]
    : nav;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => !!pathname?.startsWith(href);
  const more = links.filter((l) => MORE.has(l.href));

  useEffect(() => {
    // Only touch state when the value actually flips.
    const onScroll = () => {
      const past = window.scrollY > 20;
      setScrolled((was) => (was === past ? was : past));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "site-header sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "bg-surface border-b border-line"
          : "bg-surface border-b border-transparent"
      )}
    >
      {/* gap-4 everywhere, plus mr-4 on the brand: 32px before the links, 16px before the actions. */}
      <div className="container-fx flex h-16 max-w-[90rem]! items-center gap-4">
        {/* Logos & Brand */}
        <div className="mr-4 flex shrink-0 items-center gap-2.5 sm:gap-3">
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

        {/* Desktop nav: every link from wide up; between lg and wide, the most used ones and "More". */}
        <nav aria-label="Main" className="hidden lg:flex flex-1 items-center justify-evenly gap-1">
          {links.map((item) => (
            <span key={item.href} className={cn("inline-flex", MORE.has(item.href) && "hidden wide:inline-flex")}>
              <NavLink item={item} active={isActive(item.href)} />
            </span>
          ))}
          {more.length > 0 && (
            <span className="inline-flex wide:hidden">
              <MoreMenu items={more} isActive={isActive} />
            </span>
          )}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden lg:flex shrink-0 items-center gap-1">
          <Link href="/search" aria-label="Search" className="hidden xl:inline-flex p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
            <Search size={16} />
          </Link>
          <ThemeToggle className="p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5" />
          {user ? (
            <>
              {/* In the account menu too; shown here only where the row has room. */}
              <Link href="/notifications" aria-label="Notifications" className="hidden wide:inline-flex p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
                <Bell size={16} />
              </Link>
              {/* Also in the account menu; shown here only where the row has room. */}
              <Link href="/projects/mine" aria-label="My projects" className="hidden 2xl:inline-flex p-2 text-ink/50 hover:text-ink transition-colors rounded-sm hover:bg-ink/5">
                <LayoutGrid size={16} />
              </Link>
              <ProfileMenu user={user} />
            </>
          ) : (
            <Link href="/login" className="whitespace-nowrap text-[13px] font-medium text-ink/70 hover:text-ink transition-colors px-3 py-1.5">
              Sign in
            </Link>
          )}
          {user?.reviewerLive && (
            <span className="ml-1">
              <ReviewerLiveButton live={user.reviewerLive} place="header" />
            </span>
          )}
          {user?.candidate && (
            <span className="ml-1">
              <CandidateEntryButton entry={user.candidate} place="header" />
            </span>
          )}
          <LinkButton href="/join" size="sm" className="ml-1">
            Join <ArrowRight size={14} />
          </LinkButton>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden ml-auto p-2 -mr-2 text-ink"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {open && (
        <nav aria-label="Main" className="lg:hidden border-t border-ink/10 bg-paper px-6 py-4 flex flex-col gap-1">
          {(user?.candidate || user?.reviewerLive) && (
            <div className="mb-3 flex flex-col gap-2">
              {user.reviewerLive && <ReviewerLiveButton live={user.reviewerLive} place="mobile-menu" onNavigate={() => setOpen(false)} />}
              {user.candidate && <CandidateEntryButton entry={user.candidate} place="mobile-menu" onNavigate={() => setOpen(false)} />}
            </div>
          )}
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
          {links.map((item) => (
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
              {item.badge && <span className="ml-2 bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span>}
            </Link>
          ))}
          {user && (
            <>
              {user.panels.map((panel) => (
                <Link key={panel.href} href={panel.href} onClick={() => setOpen(false)} className="py-2.5 text-sm font-medium text-ink border-b border-ink/5">
                  {panel.label}
                </Link>
              ))}
              <Link href="/profile" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                My Profile
              </Link>
              <Link href="/notifications" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                Notifications
              </Link>
              <Link href="/profile/events" onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink/75 hover:text-ink border-b border-ink/5">
                My Events
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
