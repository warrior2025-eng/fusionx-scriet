import type { Metadata } from "next";
import { resetContent, saveContent } from "@/actions/admin-content";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, TextField, TextareaField } from "@/components/admin/admin-form";
import { ImageField } from "@/components/admin/image-field";
import { FooterEditor } from "@/components/admin/rows-editor";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getContent } from "@/lib/data/site-content";
import { SEO_PAGES, type ContentKey } from "@/lib/site-content/schema";

export const metadata: Metadata = { title: "Admin: Footer and SEO" };

export default async function SiteSettingsPage() {
  await requireCapability("settings", "/admin/settings/site");
  const [footer, seo, pages] = await Promise.all([
    getContent("footer.columns"),
    getContent("seo.default"),
    getContent("seo.pages"),
  ]);

  const reset = (key: ContentKey) => (
    <ActionButton
      variant="ghost"
      action={resetContent.bind(null, key)}
      confirm={{
        title: "Reset to the original?",
        body: "What was saved here is removed and the site goes back to what it shipped with.",
        confirmLabel: "Reset",
      }}
    >
      Reset to original
    </ActionButton>
  );

  return (
    <AdminPage
      title="Footer and SEO"
      crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Footer and SEO" }]}
    >
      <div className="space-y-6">
        <Panel title="Footer links" description="Up to four columns. Social links and the contact email are in Settings.">
          <AdminForm action={saveContent.bind(null, "footer.columns")} secondary={reset("footer.columns")}>
            <FooterEditor name="value" initial={footer} />
          </AdminForm>
        </Panel>

        <Panel title="Search and sharing: defaults">
          <AdminForm action={saveContent.bind(null, "seo.default")} secondary={reset("seo.default")}>
            <TextField
              name="defaultTitle"
              label="Home page title"
              defaultValue={seo.defaultTitle}
              maxLength={120}
            />
            <TextField
              name="titleTemplate"
              label="Title pattern for other pages"
              hint="%s is replaced with the page's own title."
              defaultValue={seo.titleTemplate}
              maxLength={120}
            />
            <TextareaField
              name="description"
              label="Default description"
              rows={3}
              max={300}
              counter
              defaultValue={seo.description}
            />
          </AdminForm>
        </Panel>

        <Panel
          title="Search and sharing: per page"
          description="Leave a field empty to keep that page's built-in title or description."
        >
          <AdminForm action={saveContent.bind(null, "seo.pages")}>
            <div className="divide-y divide-line">
              {SEO_PAGES.map((page) => {
                const value = pages[page.key] ?? {};
                return (
                  <fieldset key={page.key} className="space-y-4 py-5 first:pt-0 last:pb-0">
                    <legend className="text-sm font-semibold text-ink">
                      {page.label} <span className="font-normal text-ink/55">{page.path}</span>
                    </legend>
                    <TextField name={`${page.key}.title`} label="Title" defaultValue={value.title ?? ""} maxLength={120} />
                    <TextareaField
                      name={`${page.key}.description`}
                      label="Description"
                      rows={2}
                      max={300}
                      counter
                      defaultValue={value.description ?? ""}
                    />
                    <ImageField
                      name={`${page.key}.ogImage`}
                      label="Share image"
                      currentUrl={value.ogImage || null}
                      hint="Optional. Falls back to the default share image."
                    />
                  </fieldset>
                );
              })}
            </div>
          </AdminForm>
        </Panel>
      </div>
    </AdminPage>
  );
}
