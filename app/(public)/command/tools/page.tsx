import type { Metadata } from "next";
import Link from "next/link";
import { BulkList, ContentNav, ToolEditor, type ToolEdit } from "@/components/autopilot/content-admin";
import { categoryLabel } from "@/components/tools/tool-card";
import { getAutopilotViewer } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Tools" };

/** The Tools Library (migration 0045): edit, hide, reorder, add by hand, delete (deleted tools are never re-added). */
export default async function CommandTools() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const { data } = await supabase.from("tools").select("*").is("deleted_at", null).order("sort").order("name");
  const tools = (data ?? []) as (ToolEdit & { status: string; auto: boolean; updated_at: string })[];
  return (
    <div>
      <ContentNav />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Tools ({tools.length})</h2>
        {viewer.admin && <ToolEditor tool={null} />}
      </div>
      <BulkList kind="tool" actions={["hide", "show", "delete"]} rows={tools.map((t) => ({
        id: t.id!, title: t.name,
        meta: `${categoryLabel(t.category)} · ${t.status} · order ${t.sort} · ${t.auto ? "auto" : "edited"} · updated ${new Date(t.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`,
        extra: (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <Link href={`/tools/${t.slug}`} className="inline-flex min-h-11 items-center underline">Open</Link>
            {viewer.admin && <ToolEditor tool={t} />}
          </div>
        ),
      }))} />
    </div>
  );
}
