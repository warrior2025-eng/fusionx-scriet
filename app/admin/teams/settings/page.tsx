import type { Metadata } from "next";
import { saveContent } from "@/actions/admin-content";
import { saveFocusCategories, saveTeamsWhatsapp } from "@/actions/admin-teams";
import { AdminForm, CheckboxField, TextField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { getContent } from "@/lib/data/site-content";
import { toIstInput } from "@/lib/events/format";

export const metadata: Metadata = { title: "Admin: FusionX Teams settings" };

export default async function TeamsSettingsPage() {
  const ctx = await requireCapability("teams.manage", "/admin/teams");
  const [settings, page, register, { data: categories }, { data: link }] = await Promise.all([
    getContent("teams.settings"),
    getContent("teams.page"),
    getContent("teams.register"),
    ctx.supabase.from("team_focus_categories").select("name, is_visible").order("display_order").order("name"),
    ctx.supabase.from("private_links").select("url").eq("key", "fusionx_teams_whatsapp").maybeSingle(),
  ]);
  const visible = (categories ?? []).filter((c) => c.is_visible).map((c) => c.name as string);

  return (
    <AdminPage
      title="FusionX Teams settings"
      description="These rules are enforced by the database as well as the form, so a change here takes effect at once."
      crumbs={[{ label: "FusionX Teams", href: "/admin/teams" }, { label: "Settings" }]}
    >
      <div className="space-y-6">
        <Panel title="Registration and limits">
          <AdminForm action={saveContent.bind(null, "teams.settings")}>
            <CheckboxField name="registrationOpen" label="Team registration is open" defaultChecked={settings.registrationOpen} />
            <TextField
              name="deadline"
              label="Registration deadline (IST, optional)"
              type="datetime-local"
              defaultValue={toIstInput(settings.deadline)}
              hint="After this moment registration closes by itself. Clear it for no deadline."
              className="max-w-xs"
            />
            <TextareaField
              name="closedMessage"
              label="Message while registration is closed"
              rows={2}
              max={300}
              defaultValue={settings.closedMessage}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <TextField name="minSize" label="Smallest team" type="number" min={1} max={20} defaultValue={String(settings.minSize)} />
              <TextField name="maxSize" label="Largest team" type="number" min={2} max={50} defaultValue={String(settings.maxSize)} />
              <TextField name="maxTeamsPerUser" label="Teams per student at once" type="number" min={1} max={10} defaultValue={String(settings.maxTeamsPerUser)} />
              <TextField name="inviteExpiryDays" label="Invitations last (days)" type="number" min={1} max={60} defaultValue={String(settings.inviteExpiryDays)} />
            </div>
          </AdminForm>
        </Panel>

        <Panel title="Focus list" description="What a team can pick as its focus. One per line, in the order they should appear. A name you remove is hidden from new teams; teams already using it keep it.">
          <AdminForm action={saveFocusCategories}>
            <TextareaField name="names" label="Focus categories" rows={6} defaultValue={visible.join("\n")} />
          </AdminForm>
        </Panel>

        <Panel title="FusionX Teams WhatsApp group (private)" description="Never shown on the site. Only members of a verified team see a button that opens it.">
          <AdminForm action={saveTeamsWhatsapp} submitLabel="Save link" warnUnsaved={false}>
            <TextField name="url" label="Group invite link" type="url" placeholder="https://chat.whatsapp.com/…" defaultValue={(link?.url as string | undefined) ?? ""} hint="Clear it to remove the button." />
          </AdminForm>
        </Panel>

        <Panel title="Text on /teams">
          <AdminForm action={saveContent.bind(null, "teams.page")}>
            <TextField name="heading" label="Heading" defaultValue={page.heading} maxLength={120} />
            <TextareaField name="intro" label="Intro (optional)" rows={3} max={600} defaultValue={page.intro} />
          </AdminForm>
        </Panel>

        <Panel title="Text on /teams/register">
          <AdminForm action={saveContent.bind(null, "teams.register")}>
            <TextField name="heading" label="Heading" defaultValue={register.heading} maxLength={120} />
            <TextareaField name="intro" label="Intro (optional)" rows={3} max={600} defaultValue={register.intro} />
            <TextareaField name="difference" label="How this differs from Recruitment" rows={2} max={400} defaultValue={register.difference} />
          </AdminForm>
        </Panel>
      </div>
    </AdminPage>
  );
}
