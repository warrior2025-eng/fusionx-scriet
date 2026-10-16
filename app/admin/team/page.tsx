import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Core" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="team"
      searchParams={searchParams}
      description="The people shown on the Core page and in the home page's Core section. Use the arrows to set the order within each group."
    />
  );
}
