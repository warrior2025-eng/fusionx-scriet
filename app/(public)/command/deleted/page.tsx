import type { Metadata } from "next";
import { BulkList, ContentNav } from "@/components/autopilot/content-admin";
import { getAutopilotViewer } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Recently deleted" };

const left = (at: string) => Math.max(0, 7 - Math.floor((Date.parse(new Date().toISOString()) - Date.parse(at)) / 864e5));

/** Deleted in the last 7 days, by kind: restore puts them back everywhere (also in FusionX AI). */
export default async function RecentlyDeleted() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const [{ data: ideas }, { data: opps }, { data: tools }, { data: projects }] = await Promise.all([
    supabase.from("idea_drafts").select("id, title, deleted_at, delete_reason").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("opportunities").select("id, title, deleted_at, delete_reason").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("tools").select("id, name, deleted_at, delete_reason").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    // Projects cancelled by their owner (or deleted by an admin) in the last 7 days.
    supabase.from("projects").select("id, title, deleted_at").not("deleted_at", "is", null).gte("deleted_at", new Date(Date.parse(new Date().toISOString()) - 7 * 864e5).toISOString()).order("deleted_at", { ascending: false }),
  ]);
  type D = { id: string; title?: string; name?: string; deleted_at: string; delete_reason?: string | null };
  const rows = (list: D[] | null) => (list ?? []).map((d) => ({ id: d.id, title: d.title ?? d.name ?? "", meta: `${left(d.deleted_at)} day(s) left to restore${d.delete_reason ? ` · ${d.delete_reason}` : ""}` }));
  return (
    <div className="space-y-6" data-deleted>
      <ContentNav />
      <section><h2 className="mb-2 font-serif text-xl text-ink">Ideas</h2><BulkList kind="idea" rows={rows(ideas as D[] | null)} actions={["restore"]} /></section>
      <section><h2 className="mb-2 font-serif text-xl text-ink">Opportunities</h2><BulkList kind="opportunity" rows={rows(opps as D[] | null)} actions={["restore"]} /></section>
      <section><h2 className="mb-2 font-serif text-xl text-ink">Tools</h2><BulkList kind="tool" rows={rows(tools as D[] | null)} actions={["restore"]} /></section>
      <section><h2 className="mb-2 font-serif text-xl text-ink">Projects</h2><BulkList kind="project" rows={rows(projects as D[] | null)} actions={["restore"]} /></section>
    </div>
  );
}
