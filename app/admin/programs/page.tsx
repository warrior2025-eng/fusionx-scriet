import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Programs" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="programs"
      searchParams={searchParams}
      description="The program cards on the Programs page and the home page."
    />
  );
}
