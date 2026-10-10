import type { Metadata } from "next";
import { EntityFormPage } from "@/components/admin/entity-pages";

export const metadata: Metadata = { title: "Admin: New Mentors" };

export default function Page() {
  return <EntityFormPage entity="mentors" />;
}
