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
    <footer className="border-t border-ink/10 mt-auto">
      <div className="container-fx py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Image src="/logo-mark.png" alt="FusionX logo" width={28} height={28} className="h-7 w-7 rounded-full" />
            {settings.chapter_name}
          </div>
          <p className="mt-3 text-sm text-ink/55 max-w-xs leading-relaxed">
            {settings.tagline} A student-led innovation and research network at{" "}
            {settings.chapter_name.replace("FusionX @ ", "")}.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.heading}>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3">{col.heading}</p>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink/60 hover:text-ink transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-ink/10">
        <div className="container-fx py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink/45">
          <p>
            © {new Date().getFullYear()} {settings.chapter_name}. Built by students, for students.
          </p>
          <p>{settings.faculty_guide_title}</p>
        </div>
      </div>
    </footer>
  );
}
