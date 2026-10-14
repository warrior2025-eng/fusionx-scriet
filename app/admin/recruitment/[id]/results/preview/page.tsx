import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultView } from "@/components/recruitment/result-view";
import { AdminPage, Panel, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { MyResult } from "@/lib/recruitment/results";

export const metadata: Metadata = { title: "Admin: Preview as candidate" };

/** What one candidate will see on their status page, before or after the results. Buttons are switched off. */
export default async function PreviewCandidatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ListParams> }) {
  const { id } = await params;
  const app = param(await searchParams, "app");
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/results`);
  if (!/^[0-9a-f-]{36}$/i.test(app)) notFound();
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  const { data, error } = await ctx.supabase.rpc("preview_candidate_result", { p_application: app });
  if (!cycle || error || !data) notFound();
  const result = data as MyResult;

  return (
    <AdminPage
      title="Preview as candidate"
      description="Exactly what this candidate's status page shows. The buttons do nothing here."
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: cycle.title as string, href: `/admin/recruitment/${id}` },
        { label: "Results", href: `/admin/recruitment/${id}/results` },
        { label: "Preview" },
      ]}
    >
      <div className="max-w-3xl">
        {result.state === "published" || result.state === "preview" ? (
          <>
            {result.state === "preview" && (
              <p className="mb-4 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink">
                Preview: results are not out yet. Until the publish time, this candidate sees only the announcement date.
              </p>
            )}
            <ResultView result={result} cycleId={id} preview />
          </>
        ) : (
          <Panel title="Nothing to show">
            <p className="text-sm text-ink/70">This application is not submitted.</p>
          </Panel>
        )}
      </div>
    </AdminPage>
  );
}
