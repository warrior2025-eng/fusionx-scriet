import Link from "next/link";
import { Maintenance } from "@/components/maintenance";
import { SiteHeader } from "@/components/navigation/site-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { bannerIsLive, getOrganizationSettings } from "@/lib/data/organization";
import { getContent } from "@/lib/data/site-content";
import { getCurrentRoles, getCurrentUser } from "@/lib/permissions";
import { capabilitiesFor } from "@/lib/permissions/capabilities";
import { cycleState, getCurrentCycle } from "@/lib/recruitment/data";
import { resultsVisible } from "@/lib/recruitment/results";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Two rounds of queries instead of one after another: everything that does not need the user, with the
  // user; then what does (roles, profile, reviewer link), together.
  const [settings, user, navLinks, cycle, storedColumns] = await Promise.all([
    getOrganizationSettings(),
    getCurrentUser(),
    getContent("nav.links"),
    getCurrentCycle(),
    getContent("footer.columns"),
  ]);
  const supabase = user ? await createClient() : null;
  const [roles, profileRow, reviewerCount] = user && supabase
    ? await Promise.all([
        getCurrentRoles(),
        supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single().then((r) => r.data),
        supabase.from("recruitment_team_reviewers").select("team_id", { count: "exact", head: true }).eq("user_id", user.id).then((r) => r.count ?? 0),
      ])
    : [[], null, 0];

  // Maintenance mode: the public gets the maintenance page; staff browse on.
  if (settings.maintenance_mode) {
    const staff = roles.some((role) => role === "super_admin" || role === "admin" || role === "editor");
    if (!staff) return <Maintenance settings={settings} />;
  }

  // Links to the panels this person may open, for the account menu. The
  // panels check access again themselves; this only saves typing the address.
  const panels = [
    ...(capabilitiesFor(roles).includes("admin.access") ? [{ href: "/admin", label: "Admin panel" }] : []),
    ...(roles.includes("faculty") ? [{ href: "/faculty", label: "Faculty dashboard" }] : []),
  ];

  const profile: { full_name: string; avatar_url: string | null } | null = user
    ? profileRow
      ? { full_name: profileRow.full_name, avatar_url: profileRow.avatar_url }
      : { full_name: user.email ?? "Member", avatar_url: null }
    : null;

  // Recruitment in the header: while a cycle is open ("auto"), always, or never.
  const recruitmentOpen = cycleState(cycle) === "open";
  // From the publish time on (decided by the clock, no redeploy): a "Results" badge that leads to the lists.
  const resultsOut = resultsVisible(cycle) && cycle?.results_banner_on !== false;
  const showRecruitment = navLinks.recruitment === "on" || (navLinks.recruitment === "auto" && (recruitmentOpen || resultsOut));
  const recruitmentLink = resultsOut
    ? { badge: "Results", href: "/recruitment/results" }
    : { badge: navLinks.recruitmentBadge && recruitmentOpen ? "Open" : null, href: "/recruitment" };

  // A team reviewer gets a link to their applications in the account menu.
  if (reviewerCount) panels.push({ href: "/review", label: "Review applications" });

  // Footer: Recruitment and Teams links can be switched off; Recruitment is added to the second column when on.
  const hidden = new Set([...(navLinks.footerRecruitment ? [] : ["/recruitment"]), ...(navLinks.footerTeams ? [] : ["/teams"])]);
  const footerColumns = storedColumns.map((column, i) => {
    const links = column.links.filter((l) => !hidden.has(l.href));
    const add = navLinks.footerRecruitment && i === Math.min(1, storedColumns.length - 1) && !storedColumns.some((c) => c.links.some((l) => l.href === "/recruitment"));
    return { ...column, links: add ? [...links, { href: "/recruitment", label: "Recruitment" }] : links };
  });
  const bannerClass = "block bg-accent text-white text-center text-sm px-4 py-2";

  return (
    <>
      {settings.maintenance_mode && (
        <p className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black">
          Maintenance mode is on. Only staff can see the site.
        </p>
      )}
      {bannerIsLive(settings) &&
        (settings.announcement_banner_link ? (
          <Link href={settings.announcement_banner_link} className={`${bannerClass} underline-offset-2 hover:underline`}>
            {settings.announcement_banner}
          </Link>
        ) : (
          <div className={bannerClass}>{settings.announcement_banner}</div>
        ))}
      <SiteHeader
        chapterName={settings.chapter_name}
        subtitle={settings.subtitle}
        logoUrl={settings.logo_path}
        recruitment={showRecruitment ? recruitmentLink : null}
        user={user ? { email: user.email ?? "", fullName: profile?.full_name ?? "Member", avatarUrl: profile?.avatar_url ?? null, panels } : null}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} columns={footerColumns} />
    </>
  );
}
