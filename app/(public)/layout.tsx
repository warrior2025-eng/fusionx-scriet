import { SiteHeader } from "@/components/navigation/site-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { getOrganizationSettings } from "@/lib/data/organization";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getOrganizationSettings();

  return (
    <>
      {settings.announcement_banner_active && settings.announcement_banner && (
        <div className="bg-ink text-white text-center text-sm px-4 py-2">
          {settings.announcement_banner}
        </div>
      )}
      <SiteHeader chapterName={settings.chapter_name} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} />
    </>
  );
}
