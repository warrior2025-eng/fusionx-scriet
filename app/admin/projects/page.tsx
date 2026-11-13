import type { Metadata } from "next";
import Link from "next/link";
import type { ListParams } from "@/components/admin/ui";
import { WorkListPage } from "@/components/admin/work-list";

export const metadata: Metadata = { title: "Admin: Projects" };

export default function Page({ searchParams }: { searchParams: Promise<ListParams> }) {
  return (
    <>
      {/* FusionX Autopilot: the Idea Engine's project drafts wait here (and in Command Center → Today). */}
      <p className="mb-4 border border-line bg-surface px-3 py-2 text-sm text-ink/75">
        Project ideas from the Idea Engine: <Link href="/command/ideas" className="text-accent-text underline">adopt, save or reject them</Link>.
      </p>
      <WorkListPage kind="projects" searchParams={searchParams} />
    </>
  );
}
