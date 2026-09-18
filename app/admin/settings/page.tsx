import { getOrganizationSettings } from "@/lib/data/organization";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function AdminSettingsPage() {
  const settings = await getOrganizationSettings();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink mb-2">Settings</h1>
      <p className="text-sm text-ink/50 mb-8">
        These fields drive the public site directly — no code changes or redeploys needed.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
