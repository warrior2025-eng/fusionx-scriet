import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { AdminPage, EmptyRow, Pill, Table, Td, Th, formatDate } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { eventRegistrations } from "@/lib/admin/registrations";

export const metadata: Metadata = { title: "Admin: Registrations" };

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("content", "/admin/events");
  const { data: event } = await ctx.supabase
    .from("events")
    .select("id, title, event_date, registration_capacity, registration_url")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  const registrations = await eventRegistrations(ctx, id);
  const showEmail = ctx.caps.includes("users");
  const capacity = event.registration_capacity as number | null;

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
          <Pill tone={capacity !== null && registrations.length >= capacity ? "warn" : "neutral"}>
            {registrations.length}
            {capacity !== null ? ` of ${capacity}` : ""} registered
          </Pill>
          <LinkButton href={`/admin/events/${id}/registrations/export`} variant="secondary" size="sm">
            <Download size={14} /> Export CSV
          </LinkButton>
        </>
      }
    >
      <Table label="Registrations">
        <thead>
          <tr>
            <Th className="w-12">No.</Th>
            <Th>Name</Th>
            {showEmail && <Th>Email</Th>}
            <Th>Department</Th>
            <Th>Year</Th>
            <Th>Registered</Th>
          </tr>
        </thead>
        <tbody>
          {registrations.length === 0 && <EmptyRow colSpan={showEmail ? 6 : 5}>Nobody has registered yet.</EmptyRow>}
          {registrations.map((r, i) => (
            <tr key={r.userId}>
              <Td className="tabular-nums text-ink/60">{i + 1}</Td>
              <Td className="font-medium text-ink">{r.name}</Td>
              {showEmail && <Td className="break-all">{r.email}</Td>}
              <Td>{r.department}</Td>
              <Td>{r.year}</Td>
              <Td className="whitespace-nowrap">{formatDate(r.registeredAt, true)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
