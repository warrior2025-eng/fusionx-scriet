import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reviewApplication } from "@/actions/admin-applications";
import { AdminForm, SelectField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel, Pill, formatDate } from "@/components/admin/ui";
import { APPLICATION_STATUSES } from "@/lib/admin/applications";
import { requireCapability } from "@/lib/admin/guard";
import type { Application } from "@/types/database";

export const metadata: Metadata = { title: "Admin: Application" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-ink/55">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
        {children || <span className="text-ink/45">Not provided</span>}
      </dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("applications", "/admin/applications");
  const { data } = await ctx.supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const application = data as Application;

  return (
    <AdminPage
      title={application.full_name}
      crumbs={[{ label: "Applications", href: "/admin/applications" }, { label: application.full_name }]}
      actions={<Pill>{application.status.replace(/_/g, " ")}</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Application" className="lg:col-span-2">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="College email">{application.college_email}</Detail>
            <Detail label="Received">{formatDate(application.created_at, true)}</Detail>
            <Detail label="Department">{application.department}</Detail>
            <Detail label="Year">{application.year}</Detail>
            <Detail label="Preferred area">{application.preferred_functional_area}</Detail>
            <Detail label="Skills">{application.skills?.join(", ")}</Detail>
            <Detail label="Interests">{application.interests?.join(", ")}</Detail>
            <Detail label="Portfolio">{application.portfolio_url}</Detail>
            <Detail label="GitHub">{application.github_url}</Detail>
            <Detail label="LinkedIn">{application.linkedin_url}</Detail>
            <div className="sm:col-span-2">
              <Detail label="Motivation">{application.motivation}</Detail>
            </div>
            <div className="sm:col-span-2">
              <Detail label="Project interests">{application.project_interests}</Detail>
            </div>
            <div className="sm:col-span-2">
              <Detail label="Research interests">{application.research_interests}</Detail>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Review"
          description={
            application.reviewed_at ? `Last reviewed ${formatDate(application.reviewed_at, true)}.` : "Not reviewed yet."
          }
        >
          <AdminForm action={reviewApplication.bind(null, application.id)} submitLabel="Save review">
            <SelectField name="status" label="Status" options={APPLICATION_STATUSES} defaultValue={application.status} />
            <TextareaField
              name="note"
              label="Note (staff only)"
              rows={5}
              max={1000}
              counter
              defaultValue={application.review_notes ?? ""}
            />
          </AdminForm>
          <a
            href={`mailto:${application.college_email}`}
            className="mt-5 inline-block text-sm font-medium text-ink underline underline-offset-2"
          >
            Email the applicant
          </a>
        </Panel>
      </div>
    </AdminPage>
  );
}
