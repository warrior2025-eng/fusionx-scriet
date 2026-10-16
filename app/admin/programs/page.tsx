import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: FusionX Hubs" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="programs"
      searchParams={searchParams}
      description="The hubs on the FusionX Hubs page, their own pages and the home page. Hide a hub instead of deleting it to keep its history."
    />
  );
}
