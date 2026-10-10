import type { Metadata } from "next";
import { EntityFormPage } from "@/components/admin/entity-pages";

export const metadata: Metadata = { title: "Admin: New Team" };

export default function Page() {
  return <EntityFormPage entity="team" />;
}
