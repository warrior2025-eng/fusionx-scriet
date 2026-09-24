import { SiteHeader } from "@/components/navigation/site-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getCurrentUser } from "@/lib/permissions";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getOrganizationSettings();
  const user = await getCurrentUser();

  return (
    <>
      {settings.announcement_banner_active && settings.announcement_banner && (
        <div className="bg-accent text-white text-center text-sm px-4 py-2">
          {settings.announcement_banner}
        </div>
      )}
      <SiteHeader chapterName={settings.chapter_name} isSignedIn={!!user} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} />
    </>
  );
}