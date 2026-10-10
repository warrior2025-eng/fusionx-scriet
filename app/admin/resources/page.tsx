import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Resources" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="resources"
      searchParams={searchParams}
      description="Links shown on the Resources page."
    />
  );
}
