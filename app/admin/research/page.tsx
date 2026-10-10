import type { Metadata } from "next";
import type { ListParams } from "@/components/admin/ui";
import { WorkListPage } from "@/components/admin/work-list";

export const metadata: Metadata = { title: "Admin: Research" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return <WorkListPage kind="research" searchParams={searchParams} />;
}
