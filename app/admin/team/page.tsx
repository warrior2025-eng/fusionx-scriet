import type { Metadata } from "next";
import { CoreTabs, CoreTeamsPage } from "@/components/admin/core-teams";
import { EntityListPage } from "@/components/admin/entity-pages";
import { param, type ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Core" };

export default async function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  if (param(await searchParams, "tab") === "teams") return <CoreTeamsPage />;
  return (
    <EntityListPage
      entity="team"
      searchParams={searchParams}
      description="The people shown on the Core page and in the home page's Core section. Use the arrows to set the order within each group."
      aboveList={<CoreTabs current="sections" />}
    />
  );
}
