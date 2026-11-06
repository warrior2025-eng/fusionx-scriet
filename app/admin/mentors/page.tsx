import type { Metadata } from "next";
import { EntityListPage } from "@/components/admin/entity-pages";
import type { ListParams } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin: Mentors" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <EntityListPage
      entity="mentors"
      searchParams={searchParams}
      description="The one place for mentors: /mentors and the Core page both show this list. Add a website account and their photo, name and bio come from their own profile."
    />
  );
}
