import type { Metadata } from "next";
import Link from "next/link";
import { EntityFormPage } from "@/components/admin/entity-pages";
import { Panel } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Edit event" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <EntityFormPage
      entity="events"
      id={id}
      aside={() => (
        <Panel title="Registrations" description="People who registered for this event on the site.">
          <Link href={`/admin/events/${id}/registrations`} className="text-sm font-medium text-ink underline underline-offset-2">
            View and export registrations
          </Link>
        </Panel>
      )}
    />
  );
}
