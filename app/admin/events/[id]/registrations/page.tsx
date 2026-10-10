import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, Download, ScanLine, X } from "lucide-react";
import { addVolunteer, issueCertificates, removeVolunteer } from "@/actions/admin-events";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, TextField } from "@/components/admin/admin-form";
import {
  AdminPage,
  EmptyRow,
  Panel,
  Pill,
  Table,
  Td,
  Th,
  Toolbar,
  formatDate,
  param,
  withParams,
  type ListParams,
} from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { eventRegistrations, filterRegistrations } from "@/lib/admin/registrations";
import { STATUS_LABELS, type RegistrationStatus } from "@/lib/events/format";

export const metadata: Metadata = { title: "Admin: Registrations" };

const TONE: Record<RegistrationStatus, "good" | "warn" | "neutral" | "bad"> = {
  registered: "neutral",
  attended: "good",
  waitlisted: "warn",
  cancelled: "bad",
};

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ListParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requireCapability("content", "/admin/events");
  const base = `/admin/events/${id}/registrations`;

  const { data: event } = await ctx.supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  const all = await eventRegistrations(ctx, id);
  const shown = filterRegistrations(all, { q: param(query, "q"), status: param(query, "status") });
  const count = (status: RegistrationStatus) => all.filter((r) => r.status === status).length;
  const showEmail = ctx.caps.includes("users");
  const canIssue = ctx.caps.includes("certificates");
  const capacity = event.registration_capacity as number | null;
  const taken = count("registered") + count("attended");
  const awaiting = all.filter((r) => r.status === "attended" && !r.certificateSerial).length;
  const columns = 6 + (showEmail ? 1 : 0);

  // Volunteers: names through the caller's own (staff) session.
  const { data: volunteerRows } = await ctx.supabase.from("event_volunteers").select("user_id").eq("event_id", id);
  const volunteerIds = (volunteerRows ?? []).map((v) => v.user_id as string);
  const { data: volunteerProfiles } = volunteerIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name").in("id", volunteerIds)
    : { data: [] as { id: string; full_name: string }[] };

  return (
    <AdminPage
      title={`Registrations: ${event.title}`}
      description={
        event.registration_url
          ? "This event uses an external registration link, so sign-ups made there do not appear here."
          : undefined
      }
      crumbs={[
        { label: "Events", href: "/admin/events" },
        { label: String(event.title), href: `/admin/events/${id}` },
        { label: "Registrations" },
      ]}
      actions={
        <>
          <LinkButton href={`/check-in/${id}`} size="sm">
            <ScanLine size={15} /> Open check-in
          </LinkButton>
          <LinkButton href={withParams(`${base}/export`, query, {})} variant="secondary" size="sm">
            <Download size={14} /> Export CSV
          </LinkButton>
        </>
      }
    >
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Registered", `${taken}${capacity !== null ? ` of ${capacity}` : ""}`],
            ["Checked in", String(count("attended"))],
            ["Waitlisted", String(count("waitlisted"))],
            ["Cancelled", String(count("cancelled"))],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse border border-line bg-surface p-4">
            <dt className="mt-1 text-sm text-ink/65">{label}</dt>
            <dd className="font-serif text-2xl tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {canIssue && (
        <Panel
          title="Certificates"
          description={
            event.certificate_enabled
              ? "Issued to people who were checked in. Each gets a serial number and can download a PDF from My events."
              : "Certificates are switched off for this event. Turn them on in the event's settings."
          }
          className="mb-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              variant="primary"
              disabled={!event.certificate_enabled || awaiting === 0}
              action={issueCertificates.bind(null, id, null)}
              confirm={{
                title: "Issue certificates?",
                body: `${awaiting} attendee${awaiting === 1 ? "" : "s"} will get a certificate and a notification. People who already have one are skipped.`,
                confirmLabel: "Issue",
              }}
            >
              <Award size={15} /> Issue certificates{awaiting ? ` (${awaiting})` : ""}
            </ActionButton>
            <p className="text-sm text-ink/65">
              {awaiting === 0 ? "Nobody is waiting for a certificate." : `${awaiting} checked-in without a certificate yet.`}
            </p>
          </div>
        </Panel>
      )}

      <Toolbar
        base={base}
        params={query}
        searchPlaceholder="Search name, email, department"
        filters={[
          {
            name: "status",
            label: "Status",
            options: (Object.keys(STATUS_LABELS) as RegistrationStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          },
        ]}
      />

      <Table label="Registrations">
        <thead>
          <tr>
            <Th>Name</Th>
            {showEmail && <Th>Email</Th>}
            <Th>Department</Th>
            <Th>Year</Th>
            <Th>Status</Th>
            <Th>Checked in</Th>
            <Th>Certificate</Th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <EmptyRow colSpan={columns}>{all.length === 0 ? "Nobody has registered yet." : "Nobody matches these filters."}</EmptyRow>
          )}
          {shown.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium text-ink">{r.name}</Td>
              {showEmail && <Td className="break-all">{r.email}</Td>}
              <Td>{r.department}</Td>
              <Td>{r.year}</Td>
              <Td>
                <Pill tone={TONE[r.status]}>{STATUS_LABELS[r.status]}</Pill>
              </Td>
              <Td className="whitespace-nowrap">{formatDate(r.checkedInAt, true)}</Td>
              <Td>
                {r.certificateSerial ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a
                      href={`/api/certificates/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tabular-nums text-ink underline underline-offset-2"
                    >
                      {r.certificateSerial}
                    </a>
                    {canIssue && (
                      <ActionButton
                        variant="ghost"
                        action={issueCertificates.bind(null, id, r.id)}
                        confirm={{
                          title: "Re-issue this certificate?",
                          body: "It keeps its number. The name is taken again from the person's profile and the issue date becomes today.",
                          confirmLabel: "Re-issue",
                        }}
                      >
                        Re-issue
                      </ActionButton>
                    )}
                  </div>
                ) : r.status === "attended" && canIssue && event.certificate_enabled ? (
                  <ActionButton variant="ghost" action={issueCertificates.bind(null, id, r.id)}>
                    Issue
                  </ActionButton>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {canIssue && (
        <Panel
          title="Check-in volunteers"
          description="Members who may run the check-in page for this event only. They get no other admin access."
          className="mt-8"
        >
          {(volunteerProfiles ?? []).length > 0 && (
            <ul className="mb-5 divide-y divide-line border border-line">
              {(volunteerProfiles ?? []).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-ink">
                  {v.full_name}
                  <ActionButton
                    bare
                    danger
                    title={`Remove ${v.full_name}`}
                    action={removeVolunteer.bind(null, id, v.id)}
                    confirm={{ title: "Remove this volunteer?", body: `${v.full_name} will lose access to this event's check-in.`, confirmLabel: "Remove" }}
                  >
                    <X size={15} />
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <AdminForm action={addVolunteer.bind(null, id)} submitLabel="Add volunteer" warnUnsaved={false}>
            <TextField name="email" label="Member's email" type="email" autoComplete="off" className="max-w-sm" />
          </AdminForm>
        </Panel>
      )}
    </AdminPage>
  );
}
