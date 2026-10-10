import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Opportunities" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="opportunities"
      searchParams={searchParams}
      description="Hackathons, competitions, internships and other opportunities shared with members."
    />
  );
}
