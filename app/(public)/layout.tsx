import Link from "next/link";
import { Maintenance } from "@/components/maintenance";
import { SiteHeader } from "@/components/navigation/site-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { bannerIsLive, getOrganizationSettings } from "@/lib/data/organization";
import { getContent } from "@/lib/data/site-content";
import { getCurrentRoles, getCurrentUser } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getOrganizationSettings();
  const user = await getCurrentUser();

  // Maintenance mode: the public gets the maintenance page; staff browse on.
  if (settings.maintenance_mode) {
    const roles = user ? await getCurrentRoles() : [];
    const staff = roles.some((role) => role === "super_admin" || role === "admin" || role === "editor");
    if (!staff) return <Maintenance settings={settings} />;
  }

  let profile: { full_name: string; avatar_url: string | null } | null = null;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data
      ? { full_name: data.full_name, avatar_url: data.avatar_url }
      : { full_name: user.email ?? "Member", avatar_url: null };
  }

  const footerColumns = await getContent("footer.columns");
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
        user={user ? { email: user.email ?? "", fullName: profile?.full_name ?? "Member", avatarUrl: profile?.avatar_url ?? null } : null}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} columns={footerColumns} />
    </>
  );
}
