import type { Metadata } from "next";
import { EntityFormPage } from "@/components/admin/entity-pages";

export const metadata: Metadata = { title: "Admin: New Resources" };

export default function Page() {
  return <EntityFormPage entity="resources" />;
}
