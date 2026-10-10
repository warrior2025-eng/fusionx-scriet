import type { Metadata } from "next";
import { resetContent, saveContent } from "@/actions/admin-content";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, TextField, TextareaField } from "@/components/admin/admin-form";
import { RowsEditor } from "@/components/admin/rows-editor";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getContent } from "@/lib/data/site-content";
import { HOME_SECTIONS, ICON_NAMES, type ContentKey } from "@/lib/site-content/schema";

export const metadata: Metadata = { title: "Admin: Page content" };

export default async function ContentPage() {
  const ctx = await requireCapability("content", "/admin/content");
  const canReset = ctx.caps.includes("settings");

  const [hero, sections, about, pipeline, journey, coreAreas] = await Promise.all([
    getContent("home.hero"),
    getContent("home.sections"),
    getContent("about.page"),
    getContent("lists.pipeline"),
    getContent("lists.journey"),
    getContent("lists.core_areas"),
  ]);

  const reset = (key: ContentKey) =>
    canReset && (
      <ActionButton
        variant="ghost"
        action={resetContent.bind(null, key)}
        confirm={{
          title: "Reset to the original text?",
          body: "What was saved here is removed and the site goes back to the text it shipped with.",
          confirmLabel: "Reset",
        }}
      >
        Reset to original
      </ActionButton>
    );

  return (
    <AdminPage
      title="Page content"
      description="The words on the home and About pages, and the lists they show. Clearing a field brings back its original text."
      crumbs={[{ label: "Page content" }]}
    >
      <div className="space-y-6">
        <Panel title="Home: hero" description="The first screen of the home page.">
          <AdminForm action={saveContent.bind(null, "home.hero")} secondary={reset("home.hero")}>
            <TextField name="eyebrow" label="Eyebrow" defaultValue={hero.eyebrow} maxLength={80} />
            <TextareaField
              name="headline"
              label="Headline"
              hint="Each line here is a line of the headline."
              rows={2}
              defaultValue={hero.headline}
            />
            <TextField
              name="highlight"
              label="Highlighted word"
              hint="The word (or phrase) of the headline shown in blue. It has to appear in the headline exactly."
              defaultValue={hero.highlight}
              maxLength={40}
            />
            <TextareaField
              name="description"
              label="Description"
              hint="{name} is replaced with the chapter name."
              rows={3}
              max={400}
              counter
              defaultValue={hero.description}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="primaryCta.label" label="Main button label" defaultValue={hero.primaryCta.label} />
              <TextField name="primaryCta.href" label="Main button link" defaultValue={hero.primaryCta.href} />
              <TextField name="secondaryCta.label" label="Second button label" defaultValue={hero.secondaryCta.label} />
              <TextField name="secondaryCta.href" label="Second button link" defaultValue={hero.secondaryCta.href} />
            </div>
          </AdminForm>
        </Panel>

        <Panel title="Home: sections" description="Switch a section of the home page off without losing its content.">
          <AdminForm action={saveContent.bind(null, "home.sections")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {HOME_SECTIONS.map((section) => (
                <CheckboxField
                  key={section.key}
                  name={section.key}
                  label={section.label}
                  defaultChecked={sections[section.key]}
                />
              ))}
            </div>
          </AdminForm>
        </Panel>

        <Panel title="About page">
          <AdminForm action={saveContent.bind(null, "about.page")} secondary={reset("about.page")}>
            <TextareaField name="mission" label="Mission" rows={4} max={1500} counter defaultValue={about.mission} />
            <TextareaField name="vision" label="Vision" rows={4} max={1500} counter defaultValue={about.vision} />
            <TextareaField name="why" label="Why FusionX exists" rows={7} max={2500} counter defaultValue={about.why} />
          </AdminForm>
        </Panel>

        <Panel title="Idea to impact pipeline" description="The numbered stages on the home page.">
          <AdminForm action={saveContent.bind(null, "lists.pipeline")} secondary={reset("lists.pipeline")}>
            <RowsEditor name="value" columns={[{ key: "label", label: "Stage" }]} initial={pipeline} flat addLabel="Add stage" />
          </AdminForm>
        </Panel>

        <Panel title="Member journey" description="Shown under the pipeline and on the About page.">
          <AdminForm action={saveContent.bind(null, "lists.journey")} secondary={reset("lists.journey")}>
            <RowsEditor name="value" columns={[{ key: "label", label: "Stage" }]} initial={journey} flat addLabel="Add stage" />
          </AdminForm>
        </Panel>

        <Panel title="Core areas" description="The ways to get involved, each with an icon.">
          <AdminForm action={saveContent.bind(null, "lists.core_areas")} secondary={reset("lists.core_areas")}>
            <RowsEditor
              name="value"
              columns={[
                { key: "label", label: "Area" },
                { key: "icon", label: "Icon", options: ICON_NAMES.map((n) => ({ value: n, label: n })) },
              ]}
              initial={coreAreas}
              addLabel="Add area"
              max={8}
            />
          </AdminForm>
        </Panel>
      </div>
    </AdminPage>
  );
}
