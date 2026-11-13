import type { Metadata } from "next";
import { dayLabel, getAutopilotViewer, peopleById } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Outcomes" };

/** Verified work so far. The public pages (Now building, /impact, story pages, certificates) build on these records. */
export default async function OutcomesPage() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const [{ data: done }, { count: contributions }, { data: recent }] = await Promise.all([
    supabase.from("missions").select("id, title, mission_date, outcome_links").eq("status", "done").order("mission_date", { ascending: false }).limit(20),
    supabase.from("contributions").select("id", { count: "exact", head: true }).eq("counts", true),
    supabase.from("contributions").select("id, title, user_id, contributed_on").eq("counts", true).order("contributed_on", { ascending: false }).limit(15),
  ]);
  const names = await peopleById(supabase, (recent ?? []).map((r) => r.user_id as string));
  return (
    <div className="grid gap-5 lg:grid-cols-2" data-outcomes>
      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Missions done ({(done ?? []).length})</h2>
        {(done ?? []).length === 0 ? <p className="mt-2 text-sm text-ink/60">None yet. A mission is done when its owner marks it so, with its outcome links.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {((done ?? []) as { id: string; title: string; mission_date: string; outcome_links: string[] }[]).map((m) => (
              <li key={m.id}>{m.title} <span className="text-xs text-ink/60">· {dayLabel(m.mission_date)} · {m.outcome_links.length} outcome link{m.outcome_links.length === 1 ? "" : "s"}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Verified contributions ({contributions ?? 0})</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {((recent ?? []) as { id: string; title: string; user_id: string; contributed_on: string }[]).map((c) => (
            <li key={c.id}>{c.title} <span className="text-xs text-ink/60">· {names.get(c.user_id)?.full_name} · {dayLabel(c.contributed_on)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
