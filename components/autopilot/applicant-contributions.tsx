import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Read-only, admins only: the applicant's verified FusionX contributions (migration 0043), and the
 * Core team's note when they were a shortlisted Core Collaborator. Nothing here selects anyone.
 */
export async function ApplicantContributions({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data, error } = await supabase.rpc("ap_applicant_contributions", { p_user: userId });
  if (error) return null;
  const rows = (data ?? []) as { title: string; mission: string | null; contributed_on: string; recommended: boolean }[];
  if (rows.length === 0) return null;
  return (
    <section className="mb-6 border border-line bg-surface p-4" data-applicant-contributions>
      <h2 className="font-serif text-lg text-ink">FusionX contributions ({rows.length})</h2>
      <p className="text-xs text-ink/60">Verified (reviewed and approved) work. Read-only; for admins.</p>
      {rows[0].recommended && <p className="mt-2 text-sm font-semibold text-ink">Recommended by FusionX Core</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={i}>{r.title}<span className="text-xs text-ink/60">{r.mission ? ` · ${r.mission}` : ""} · {r.contributed_on}</span></li>
        ))}
      </ul>
    </section>
  );
}
