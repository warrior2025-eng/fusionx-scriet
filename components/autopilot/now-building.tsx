import Link from "next/link";
import { Check } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { hubLabel } from "@/lib/autopilot/labels";
import { createClient } from "@/lib/supabase/server";

/**
 * "Now building": FusionX's public missions while they move, from verified work only (migration 0044).
 * Always positive: no late, overdue or stuck words, no colours for health, no internal notes or proofs.
 * A date shows only when the mission is on track; otherwise just the next step. With nothing listed it
 * shows the latest real wins, and with nothing at all it is not shown.
 */

const ago = (iso: string | null) => {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));
  return h < 1 ? "just now" : h < 24 ? `${h} h ago` : h < 48 ? "yesterday" : `${Math.round(h / 24)} days ago`;
};
const when = (date: string) => new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

type Row = { slug: string; title: string; goal: string; hubs: string[]; done: number; total: number; phase: number; wins: { title: string; at: string }[];
  people: { name: string; avatar_url: string | null }[]; outside: number; next_label: string | null; next_date: string | null; updated_at: string | null };

export async function NowBuilding({ index, band, compact = false }: { index?: number; band?: "surface" | "tint" | "navy"; compact?: boolean }) {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: wins }] = await Promise.all([supabase.rpc("ap_now_building"), supabase.rpc("ap_latest_wins", { p_limit: 6 })]);
  if (error) return null; // before migration 0044
  const list = (rows ?? []) as Row[];
  const latest = (wins ?? []) as { title: string; mission: string; slug: string; at: string }[];
  if (list.length === 0 && latest.length === 0) return null;
  const updated = list.map((r) => r.updated_at).filter(Boolean).sort().pop() ?? latest[0]?.at ?? null;

  const body = (
    <div data-now-building>
      <p className="mb-5 flex items-center gap-2 text-sm text-ink/70">
        <span className="relative inline-flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span>
        live · updated {ago(updated)}
      </p>
      {list.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.slice(0, compact ? 4 : 12).map((m) => {
            const pct = m.total ? Math.round((100 * m.done) / m.total) : 0;
            return (
              <li key={m.slug} className="border border-line bg-surface p-5" data-now-mission>
                <p className="text-xs uppercase tracking-wide text-ink/60">{m.hubs.map(hubLabel).join(" · ")}</p>
                <h3 className="mt-1 font-serif text-xl text-ink">{m.title}</h3>
                {m.goal && <p className="mt-1 text-sm text-ink/75">{m.goal}</p>}
                <div className="mt-4 h-1.5 bg-ink/10" role="progressbar" aria-valuenow={m.done} aria-valuemax={m.total} aria-label={`${m.title}: ${m.done} of ${m.total} steps done`}>
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-ink/65">{m.phase > 1 ? `New phase started · ` : ""}{m.done} of {m.total} steps done</p>
                {m.wins.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {m.wins.map((w) => <li key={w.title + w.at} className="flex items-start gap-1.5 text-ink/85"><Check size={14} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />{w.title} <span className="text-xs text-ink/55">{ago(w.at)}</span></li>)}
                  </ul>
                )}
                {m.next_label && <p className="mt-3 text-sm text-ink/75">Next: {m.next_label}{m.next_date ? ` · ${when(m.next_date)}` : ""}</p>}
                {(m.people.length > 0 || m.outside > 0) && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {m.people.slice(0, 6).map((p) => p.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img key={p.name} src={p.avatar_url} alt={p.name} title={p.name} className="h-7 w-7 rounded-full border-2 border-paper object-cover" />
                        : <span key={p.name} title={p.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper bg-accent text-[10px] font-semibold text-white">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>)}
                    </div>
                    {m.outside > 0 && <span className="text-xs text-ink/65">+ {m.outside} outside contributor{m.outside === 1 ? "" : "s"}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-2" data-latest-wins>
          {latest.map((w) => <li key={w.title + w.at} className="flex items-start gap-2 text-ink/85"><Check size={15} className="mt-1 shrink-0 text-accent-text" aria-hidden /><span>{w.title} <span className="text-sm text-ink/60">· {w.mission} · {ago(w.at)}</span></span></li>)}
        </ul>
      )}
      {compact && <p className="mt-5 text-sm"><Link href="/impact" className="text-accent-text underline">See the Impact Board</Link></p>}
    </div>
  );
  if (!compact) return body;
  return (
    <Section band={band}>
      <SectionHeading index={index} eyebrow="Now building" title="What FusionX is building right now." />
      <div className="mt-8">{body}</div>
    </Section>
  );
}
