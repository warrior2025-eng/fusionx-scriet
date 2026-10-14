import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultsLists } from "@/components/recruitment/results-lists";
import { AdminPage } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { PublicResults } from "@/lib/recruitment/results";

export const metadata: Metadata = { title: "Admin: Preview public results" };

/** The public results page as it will look, before the publish time. Staff only. */
export default async function PreviewPublicResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/results`);
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("id, title").eq("id", id).maybeSingle();
  const { data, error } = await ctx.supabase.rpc("preview_public_results", { p_cycle: id });
  if (!cycle || error || !data) notFound();
  const results = data as PublicResults;

  return (
    <AdminPage
      title="Preview: public results page"
      description="What /recruitment/results will show, with the current decisions, toggles and consent. Visitors see none of it before the publish time."
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: cycle.title as string, href: `/admin/recruitment/${id}` },
        { label: "Results", href: `/admin/recruitment/${id}/results` },
        { label: "Public preview" },
      ]}
    >
      {results.state === "published" || results.state === "preview" ? <ResultsLists results={results} /> : <p className="text-sm text-ink/70">Nothing to show.</p>}
    </AdminPage>
  );
}
