import Image from "next/image";
import Link from "next/link";
import type { OrganizationSettings } from "@/types/database";

const columns = [
  {
    heading: "Explore",
    links: [
      { href: "/about", label: "About" },
      { href: "/programs", label: "Programs" },
      { href: "/projects", label: "Projects" },
      { href: "/research", label: "Research & IP" },
    ],
  },
  {
    heading: "Participate",
    links: [
      { href: "/opportunities", label: "Opportunities" },
      { href: "/events", label: "Events" },
      { href: "/teams", label: "Teams" },
      { href: "/mentors", label: "Mentors" },
      { href: "/join", label: "Join FusionX" },
    ],
  },
  {
    heading: "Organization",
    links: [
      { href: "/founders", label: "Founding Team" },
      { href: "/resources", label: "Resources" },
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Code of Conduct" },
    ],
  },
];

export function SiteFooter({ settings }: { settings: OrganizationSettings }) {
  return (
    <footer className="border-t border-ink/8 mt-auto bg-surface/50">
      <div className="container-fx py-16 md:py-20">
        {/* Top: Brand + Tagline */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5">
              <Image src="/logo-mark.png" alt="FusionX logo" width={32} height={32} className="h-8 w-8 rounded-full" />
              <span className="font-semibold text-ink tracking-tight">{settings.chapter_name}</span>
            </div>
            <p className="mt-4 text-sm text-ink/50 max-w-sm leading-relaxed">
              {settings.tagline} A student-led innovation and research network at{" "}
              {settings.chapter_name.replace("FusionX @ ", "")}.
            </p>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-ink/30">
              From Ideas to Impact.
            </p>
          </div>

          {/* Link Columns */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {columns.map((col) => (
              <div key={col.heading}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/35 mb-4">
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink/55 hover:text-ink transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-ink/8">
        <div className="container-fx py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-ink/35">
            © {new Date().getFullYear()} {settings.chapter_name}
          </p>
          <p className="text-xs text-ink/35">
            Built by students, for students.
          </p>
        </div>
      </div>
    </footer>
  );
}
