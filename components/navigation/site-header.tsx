"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkButton } from "@/components/ui/button";

const nav = [
  { href: "/about", label: "About" },
  { href: "/programs", label: "Programs" },
  { href: "/projects", label: "Projects" },
  { href: "/research", label: "Research" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/events", label: "Events" },
  { href: "/founders", label: "Team" },
];

export function SiteHeader({ chapterName }: { chapterName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
      <div className="container-fx flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink" onClick={() => setOpen(false)}>
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-ink text-xs font-bold text-white">
            FX
          </span>
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
          <Link href="/login" className="text-sm text-ink/65 hover:text-ink transition-colors">
            Sign in
          </Link>
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
          <div className="flex gap-3 pt-4">
            <LinkButton href="/login" variant="secondary" size="sm" className="flex-1">
              Sign in
            </LinkButton>
            <LinkButton href="/join" size="sm" className="flex-1">
              Join FusionX
            </LinkButton>
          </div>
        </nav>
      )}
    </header>
  );
}
