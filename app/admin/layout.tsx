import { redirect } from "next/navigation";
import { AdminShell, type AdminNavGroup, type AdminNavItem } from "@/components/admin/admin-shell";
import { getAdminContext } from "@/lib/admin/guard";
import { getOrganizationSettings } from "@/lib/data/organization";
import { ROLE_LABELS, type Capability } from "@/lib/permissions/capabilities";
import type { AppRole } from "@/types/database";

// Every section, with the capability it needs. The sidebar shows only what
// the current role can use; each page and action checks again on its own.
const NAV: { heading: string; items: (AdminNavItem & { cap: Capability })[] }[] = [
  {
    heading: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "overview", cap: "admin.access" }],
  },
  {
    heading: "Website",
    items: [
      { href: "/admin/content", label: "Page content", icon: "content", cap: "content" },
      { href: "/admin/team", label: "Team", icon: "team", cap: "team" },
      { href: "/admin/programs", label: "Programs", icon: "programs", cap: "content" },
      { href: "/admin/events", label: "Events", icon: "events", cap: "content" },
      { href: "/admin/opportunities", label: "Opportunities", icon: "opportunities", cap: "content" },
      { href: "/admin/resources", label: "Resources", icon: "resources", cap: "content" },
      { href: "/admin/announcements", label: "Announcements", icon: "announcements", cap: "content" },
      { href: "/admin/mentors", label: "Mentors", icon: "mentors", cap: "content" },
    ],
  },
  {
    heading: "Community",
    items: [
      { href: "/admin/applications", label: "Applications", icon: "applications", cap: "applications" },
      { href: "/admin/users", label: "Users & roles", icon: "users", cap: "users" },
      { href: "/admin/projects", label: "Projects", icon: "projects", cap: "moderation" },
      { href: "/admin/research", label: "Research", icon: "research", cap: "moderation" },
      { href: "/admin/teams", label: "Project teams", icon: "teams", cap: "moderation" },
      { href: "/admin/messages", label: "Messages", icon: "messages", cap: "messages" },
      { href: "/admin/notifications", label: "Broadcast", icon: "notifications", cap: "broadcast" },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/admin/media", label: "Media library", icon: "media", cap: "media" },
      { href: "/admin/audit-logs", label: "Audit log", icon: "audit", cap: "audit" },
      { href: "/admin/settings", label: "Settings", icon: "settings", cap: "settings" },
      { href: "/admin/danger", label: "Danger zone", icon: "danger", cap: "danger" },
    ],
  },
];

const RANK: AppRole[] = ["super_admin", "admin", "editor"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  if (!ctx.user) redirect("/login?next=/admin");
  if (!ctx.caps.includes("admin.access")) redirect("/");

  const settings = await getOrganizationSettings();
  const groups: AdminNavGroup[] = NAV.map((group) => ({
    heading: group.heading,
    items: group.items
      .filter((item) => ctx.caps.includes(item.cap))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);

  const topRole = RANK.find((role) => ctx.roles.includes(role)) ?? "editor";

  return (
    <AdminShell
      groups={groups}
      userName={ctx.fullName}
      roleLabel={ROLE_LABELS[topRole]}
      siteName={settings.chapter_name}
    >
      {children}
    </AdminShell>
  );
}
