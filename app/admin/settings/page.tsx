import type { Metadata } from "next";
import Link from "next/link";
import { saveBanner, saveIdentity, saveRegistration } from "@/actions/admin-settings";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { ImageField } from "@/components/admin/image-field";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = { title: "Admin: Settings" };

/** A stored timestamp as a datetime-local value in India time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export default async function SettingsPage() {
  await requireCapability("settings", "/admin/settings");
  const settings = await getOrganizationSettings();

  return (
    <AdminPage
      title="Settings"
      description="Site identity, the announcement banner and registration. Changes go live as soon as they are saved."
      crumbs={[{ label: "Settings" }]}
      actions={
        <Link href="/admin/settings/site" className="text-sm font-medium text-ink underline underline-offset-2">
          Footer and SEO
        </Link>
      }
    >
      <div className="space-y-6">
        <Panel title="Identity">
          <AdminForm action={saveIdentity}>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="chapter_name" label="Chapter name" defaultValue={settings.chapter_name} maxLength={80} />
              <TextField name="subtitle" label="Subtitle" defaultValue={settings.subtitle} maxLength={80} />
            </div>
            <TextField name="tagline" label="Tagline" defaultValue={settings.tagline} maxLength={120} />
            <ImageField
              name="logo"
              label="Logo"
              square
              currentUrl={settings.logo_path}
              hint="Shown in the header, footer and sign-in pages. Square, up to 2MB. Leave empty to use the built-in logo."
            />
            <ImageField
              name="favicon"
              label="Favicon"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon"
              currentUrl={settings.favicon_path}
              hint="The browser-tab icon. PNG or ICO, up to 2MB."
            />
            <ImageField
              name="og_image"
              label="Default share image"
              currentUrl={settings.og_image_path}
              hint="Shown when a page is shared. 1200×630 works best."
            />
            <SelectField
              name="institutional_approval"
              label="Institutional approval status"
              defaultValue={settings.institutional_approval}
              options={[
                { value: "faculty_guide_confirmed", label: "Faculty guide confirmed" },
                { value: "director_review_pending", label: "Forwarded for Director review" },
                { value: "officially_approved", label: "Officially approved" },
              ]}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="official_email"
                label="Official contact email (optional)"
                type="email"
                defaultValue={settings.official_email ?? ""}
              />
              <TextField name="instagram_url" label="Instagram (optional)" type="url" defaultValue={settings.instagram_url ?? ""} />
              <TextField name="linkedin_url" label="LinkedIn (optional)" type="url" defaultValue={settings.linkedin_url ?? ""} />
              <TextField name="github_url" label="GitHub (optional)" type="url" defaultValue={settings.github_url ?? ""} />
            </div>
          </AdminForm>
        </Panel>

        <Panel title="Announcement banner" description="A strip across the top of every public page.">
          <AdminForm action={saveBanner}>
            <TextField
              name="announcement_banner"
              label="Text"
              defaultValue={settings.announcement_banner ?? ""}
              maxLength={200}
            />
            <TextField
              name="announcement_banner_link"
              label="Link (optional)"
              hint="Makes the banner clickable. A path like /events or a full https:// link."
              defaultValue={settings.announcement_banner_link ?? ""}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="announcement_banner_starts_at"
                label="Show from (optional)"
                type="datetime-local"
                hint="India time."
                defaultValue={toLocalInput(settings.announcement_banner_starts_at)}
              />
              <TextField
                name="announcement_banner_ends_at"
                label="Hide after (optional)"
                type="datetime-local"
                hint="India time."
                defaultValue={toLocalInput(settings.announcement_banner_ends_at)}
              />
            </div>
            <CheckboxField
              name="announcement_banner_active"
              label="Banner is on"
              hint="With dates set, it shows only between them."
              defaultChecked={settings.announcement_banner_active}
            />
          </AdminForm>
        </Panel>

        <Panel title="Registration">
          <AdminForm action={saveRegistration}>
            <CheckboxField
              name="join_open"
              label="The Join form is open"
              hint="When off, /join shows the message below instead of the form."
              defaultChecked={settings.join_open}
            />
            <TextareaField
              name="join_closed_message"
              label="Message while applications are closed"
              rows={3}
              max={400}
              counter
              defaultValue={settings.join_closed_message ?? ""}
            />
            <CheckboxField
              name="signup_enabled"
              label="Public sign-up is enabled"
              hint="When off, nobody can create an account, including from the Supabase dashboard."
              defaultChecked={settings.signup_enabled}
            />
          </AdminForm>
        </Panel>
      </div>
    </AdminPage>
  );
}
