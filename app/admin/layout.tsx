import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff, getCurrentUser } from "@/lib/permissions";
import { logoutAction } from "@/actions/auth";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/opportunities", label: "Opportunities" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  const authorized = await isStaff();
  if (!authorized) redirect("/");

  return (
    <div className="min-h-screen flex bg-paper">
      <aside className="w-56 shrink-0 border-r border-ink/10 hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-ink/10 font-semibold text-sm">
          FusionX Admin
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-sm px-3 py-2 text-sm text-ink/65 hover:text-ink hover:bg-ink/5 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-ink/10">
          <form action={logoutAction}>
            <button className="w-full text-left rounded-sm px-3 py-2 text-sm text-ink/55 hover:text-ink hover:bg-ink/5">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-6 py-10">{children}</div>
      </div>
    </div>
  );
}
