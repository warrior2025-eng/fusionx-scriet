import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { bulkReviewApplications } from "@/actions/admin-applications";
import { AdminForm, SelectField, TextareaField } from "@/components/admin/admin-form";
import { SelectAll } from "@/components/admin/select-all";
import {
  AdminPage,
  EmptyRow,
  Pagination,
  Pill,
  Table,
  Td,
  Th,
  Toolbar,
  formatDate,
  pageOf,
  param,
  withParams,
  type ListParams,
} from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { APPLICATION_STATUSES, applicationsQuery } from "@/lib/admin/applications";
import { requireCapability } from "@/lib/admin/guard";
import type { Application } from "@/types/database";

export const metadata: Metadata = { title: "Admin: Applications" };

const PAGE_SIZE = 25;
const TONE = { selected: "good", shortlisted: "good", rejected: "bad", submitted: "warn" } as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("applications", "/admin/applications");
  const params = await searchParams;
  const page = pageOf(params);

  const { data, count } = await applicationsQuery(ctx, {
    q: param(params, "q"),
    status: param(params, "status"),
    department: param(params, "department"),
    from: param(params, "from"),
    to: param(params, "to"),
  }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const applications = (data ?? []) as unknown as Application[];

  return (
    <AdminPage
      title="Applications"
      description="Applications to join. Applicants are notified in the app when their status changes."
      crumbs={[{ label: "Applications" }]}
      actions={
        <LinkButton href={withParams("/admin/applications/export", params, { page: undefined })} variant="secondary" size="sm">
          <Download size={14} /> Export CSV
        </LinkButton>
      }
    >
      <Toolbar
        base="/admin/applications"
        params={params}
        searchPlaceholder="Search name or email"
        filters={[{ name: "status", label: "Status", options: APPLICATION_STATUSES }]}
        dateRange
      >
        <label className="block">
          <span className="mb-1 block text-xs text-ink/60">Department</span>
          <input
            name="department"
            defaultValue={param(params, "department")}
            className="w-36 rounded-sm border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </Toolbar>

      <AdminForm action={bulkReviewApplications} submitLabel="Apply to selected" warnUnsaved={false}>
        <Table label="Applications">
          <thead>
            <tr>
              <Th className="w-10">
                <SelectAll name="ids" label="Select all applications on this page" />
              </Th>
              <Th>Applicant</Th>
              <Th>Department</Th>
              <Th>Year</Th>
              <Th>Area</Th>
              <Th>Received</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 && <EmptyRow colSpan={7}>No applications match.</EmptyRow>}
            {applications.map((application) => (
              <tr key={application.id}>
                <Td>
                  <input
                    type="checkbox"
                    name="ids"
                    value={application.id}
                    aria-label={`Select ${application.full_name}`}
                    className="h-4 w-4 accent-accent"
                  />
                </Td>
                <Td>
                  <Link href={`/admin/applications/${application.id}`} className="font-medium text-ink hover:underline">
                    {application.full_name}
                  </Link>
                  <span className="block break-all text-xs text-ink/60">{application.college_email}</span>
                </Td>
                <Td>{application.department}</Td>
                <Td>{application.year}</Td>
                <Td>{application.preferred_functional_area}</Td>
                <Td className="whitespace-nowrap">{formatDate(application.created_at)}</Td>
                <Td>
                  <Pill tone={TONE[application.status as keyof typeof TONE] ?? "neutral"}>
                    {application.status.replace(/_/g, " ")}
                  </Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="grid gap-5 border border-line bg-surface p-5 sm:grid-cols-3">
          <SelectField
            name="status"
            label="Set selected applications to"
            options={APPLICATION_STATUSES.filter((s) => s.value !== "submitted")}
            defaultValue="under_review"
          />
          <TextareaField
            name="note"
            label="Note (optional, staff only)"
            rows={2}
            max={1000}
            className="sm:col-span-2"
          />
        </div>
      </AdminForm>

      <Pagination base="/admin/applications" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </AdminPage>
  );
}
