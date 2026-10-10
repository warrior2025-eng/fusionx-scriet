import type { Metadata } from "next";
import { EntityFormPage } from "@/components/admin/entity-pages";

export const metadata: Metadata = { title: "Admin: Edit Programs" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EntityFormPage entity="programs" id={id} />;
}
