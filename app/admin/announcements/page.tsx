import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Announcements" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="announcements"
      searchParams={searchParams}
      description="Announcements that appear in site search once published."
    />
  );
}
