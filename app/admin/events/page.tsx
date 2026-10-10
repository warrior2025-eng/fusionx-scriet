import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Events" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="events"
      searchParams={searchParams}
      description="Events, their status, capacity and registration."
      rowLinks={(row) => [{ href: `/admin/events/${row.id}/registrations`, label: "Registrations" }]}
    />
  );
}
