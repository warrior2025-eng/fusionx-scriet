import type { Metadata } from "next";
import type { ListParams } from "@/components/admin/ui";
import { WorkListPage } from "@/components/admin/work-list";

export const metadata: Metadata = { title: "Admin: Projects" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return <WorkListPage kind="projects" searchParams={searchParams} />;
}
