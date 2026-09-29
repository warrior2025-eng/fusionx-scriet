import { SiteHeader } from "@/components/navigation/site-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getCurrentUser } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getOrganizationSettings();
  const user = await getCurrentUser();

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

  return (
    <>
      {settings.announcement_banner_active && settings.announcement_banner && (
        <div className="bg-accent text-white text-center text-sm px-4 py-2">
          {settings.announcement_banner}
        </div>
      )}
      <SiteHeader
        chapterName={settings.chapter_name}
        user={user ? { email: user.email ?? "", fullName: profile?.full_name ?? "Member", avatarUrl: profile?.avatar_url ?? null } : null}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} />
    </>
  );
}
