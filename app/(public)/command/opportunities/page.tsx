import type { Metadata } from "next";
import { BulkList, CollegeOpportunityForm, ContentNav, DeleteBatchButton } from "@/components/autopilot/content-admin";
import { getAutopilotViewer } from "@/lib/autopilot/server";
import { daysLeftLabel, sectionLabel, sectionOf, todayIST, type Opp } from "@/lib/opportunities/sections";

export const metadata: Metadata = { title: "Command Center · Opportunities" };

/** Opportunities (migration 0045): the college form, each morning's run, and hide / delete for any item. */
export default async function CommandOpportunities() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const today = todayIST();
  const { data } = await supabase.from("opportunities").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as (Opp & { is_published: boolean; hidden: boolean; run_id: string | null; created_at: string })[];
  const runs = new Map<string, { n: number; at: string }>();
  for (const o of rows) if (o.run_id) runs.set(o.run_id, { n: (runs.get(o.run_id)?.n ?? 0) + 1, at: o.created_at });
  const row = (o: (typeof rows)[number]) => ({
    id: o.id, title: o.title,
    meta: `${sectionLabel(sectionOf(o))} · ${o.organizer} · ${daysLeftLabel(o.deadline, o.rolling, today)} · ${o.hidden ? "hidden" : o.is_published ? "live" : "closed"} · ${o.source ?? "manual"}`,
  });
  return (
    <div>
      <ContentNav />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <h2 className="font-serif text-xl text-ink">All opportunities ({rows.length})</h2>
          <p className="mb-3 text-xs text-ink/60">Live ones stay until their deadline; the night job closes them after it. Deleted ones can be restored for 7 days.</p>
          <BulkList kind="opportunity" rows={rows.map(row)} actions={["hide", "show", "delete"]} />
        </section>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-4">
            <h2 className="font-serif text-lg text-ink">Add college opportunity</h2>
            <p className="mb-3 text-xs text-ink/60">Published at once in &ldquo;At SCRIET&rdquo;.</p>
            <CollegeOpportunityForm />
          </section>
          <section className="border border-line bg-surface p-4" data-runs>
            <h2 className="font-serif text-lg text-ink">Morning runs</h2>
            {runs.size === 0 ? <p className="mt-2 text-sm text-ink/60">No automatic runs yet.</p> : (
              <ul className="mt-2 space-y-2 text-sm">
                {[...runs.entries()].slice(0, 10).map(([id, r]) => (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2"><span>{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {r.n} item{r.n === 1 ? "" : "s"}</span>
                    {viewer.admin && <DeleteBatchButton kind="opportunities" batch={id} label="Delete all from this run" />}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
