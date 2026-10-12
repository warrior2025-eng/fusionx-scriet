import Link from "next/link";
import { saveContent } from "@/actions/admin-content";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { Panel } from "@/components/admin/ui";
import { getContent } from "@/lib/data/site-content";
import { toIstInput } from "@/lib/events/format";

/**
 * The recruitment page's text and where Recruitment and Teams are linked
 * from. Shown under the cycles list. `canSettings` gates the navigation
 * panel, which is an admin setting; the text is open to editors.
 */
export async function RecruitmentSiteControls({ canSettings }: { canSettings: boolean }) {
  const [page, nav] = await Promise.all([getContent("recruitment.page"), getContent("nav.links")]);
  return (
    <>
      <Panel title="Text on /recruitment" className="mt-8">
        <AdminForm action={saveContent.bind(null, "recruitment.page")}>
          <TextField name="heading" label="Heading" defaultValue={page.heading} maxLength={120} />
          <TextareaField name="intro" label="Intro (optional)" rows={3} max={600} defaultValue={page.intro} />
          <TextareaField name="difference" label="How this differs from Join and FusionX Teams" rows={2} max={400} defaultValue={page.difference} />
        </AdminForm>
      </Panel>

      {canSettings && (
        <Panel
          title="Links to Recruitment and Teams"
          description={
            <>
              For a banner across the top of the site (text, link, start and end date), use the announcement banner in{" "}
              <Link href="/admin/settings" className="underline underline-offset-2">
                Settings
              </Link>
              .
            </>
          }
          className="mt-6"
        >
          <AdminForm action={saveContent.bind(null, "nav.links")}>
            <SelectField
              name="recruitment"
              label="Recruitment in the header"
              defaultValue={nav.recruitment}
              options={[
                { value: "auto", label: "Automatic: only while a cycle is open" },
                { value: "on", label: "Always show" },
                { value: "off", label: "Never show" },
              ]}
              className="max-w-md"
            />
            <CheckboxField name="recruitmentBadge" label={'Show an "Open" badge on it while a cycle is open'} defaultChecked={nav.recruitmentBadge} />
            <CheckboxField name="footerRecruitment" label="Show Recruitment in the footer" defaultChecked={nav.footerRecruitment} />
            <CheckboxField name="footerTeams" label="Show Teams in the footer" defaultChecked={nav.footerTeams} />
          </AdminForm>
        </Panel>
      )}
    </>
  );
}

/** Join form controls shown under the applications list: deadline, page text and the two result messages. */
export async function JoinControls() {
  const [settings, page, templates] = await Promise.all([getContent("join.settings"), getContent("join.page"), getContent("join.templates")]);
  return (
    <div className="mt-10 space-y-6">
      <Panel
        title="Join form: deadline"
        description={
          <>
            Opening or closing the form, and the message shown while it is closed, are in{" "}
            <Link href="/admin/settings" className="underline underline-offset-2">
              Settings
            </Link>
            . The deadline closes it by itself.
          </>
        }
      >
        <AdminForm action={saveContent.bind(null, "join.settings")}>
          <TextField name="deadline" label="Deadline (IST, optional)" type="datetime-local" defaultValue={toIstInput(settings.deadline)} hint="Clear it for no deadline." className="max-w-xs" />
        </AdminForm>
      </Panel>

      <Panel title="Text on /join">
        <AdminForm action={saveContent.bind(null, "join.page")}>
          <TextField name="heading" label="Heading" defaultValue={page.heading} maxLength={120} />
          <TextareaField name="intro" label="Intro" rows={3} max={600} defaultValue={page.intro} />
        </AdminForm>
      </Panel>

      <Panel title="Approval and rejection messages" description="Sent as a notification when an application is marked Selected or Rejected. {name} is the applicant's name.">
        <AdminForm action={saveContent.bind(null, "join.templates")}>
          <TextareaField name="approved" label="Approved" rows={2} max={600} counter defaultValue={templates.approved} />
          <TextareaField name="rejected" label="Not approved" rows={2} max={600} counter defaultValue={templates.rejected} />
        </AdminForm>
      </Panel>
    </div>
  );
}
