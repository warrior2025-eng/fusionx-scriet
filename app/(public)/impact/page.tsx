import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { NowBuilding } from "@/components/autopilot/now-building";
import { createClient } from "@/lib/supabase/server";
import { semesterStart } from "@/lib/autopilot/outcomes";

export const metadata: Metadata = {
  title: "Impact",
  description: "What FusionX@SCRIET has built, from verified records: missions, workshops, hackathons, projects and the people behind them.",
};

type Stats = {
  missions: number; workshops: number; build_nights: number; attendance: number; posts: number; hackathons: number; projects_shipped: number;
  research: number; contributions: number; members: number; outside: number; departments: number;
  evidence: { slug: string; title: string; kind: string | null; done_at: string; links: string[]; published: boolean }[];
};

const LABELS: [keyof Stats, string][] = [
  ["missions", "Missions completed"], ["workshops", "Workshops"], ["attendance", "Workshop and event attendance"], ["build_nights", "Build Nights"],
  ["hackathons", "Hackathon entries"], ["projects_shipped", "Projects shipped"], ["research", "Papers and patent attempts"], ["posts", "Posts and digests"],
  ["contributions", "Verified contributions"], ["members", "Members who contributed"], ["outside", "Community and outside contributors"], ["departments", "Departments"],
];

/** The Impact Board: real counts from FusionX's records, each backed by its evidence. Public outcomes only. */
export default async function ImpactPage() {
  const supabase = await createClient();
  const from = semesterStart();
  const [{ data: sem, error }, { data: all }, { data: recog }] = await Promise.all([
    supabase.rpc("ap_impact_stats", { p_from: from }),
    supabase.rpc("ap_impact_stats", { p_from: null }),
    supabase.rpc("ap_recognitions_public"),
  ]);
  const s = (sem ?? null) as Stats | null, a = (all ?? null) as Stats | null;
  return (
    <>
      <Section className="pb-8 pt-14">
        <Eyebrow>Impact</Eyebrow>
        <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">What we have built.</h1>
        <p className="mt-3 max-w-2xl text-ink/75">Every number here comes from FusionX&apos;s records of finished, reviewed work, and links to its evidence.</p>
        {error || !s || !a ? <p className="mt-8 text-ink/70">The Impact Board is getting ready.</p> : (
          <dl className="mt-10 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-4" data-impact-stats>
            {LABELS.map(([k, label]) => (
              <div key={k} className="bg-paper p-4">
                <dt className="text-sm text-ink/70">{label}</dt>
                <dd className="mt-1 font-serif text-3xl tabular-nums text-ink">{a[k] as number}</dd>
                <dd className="text-xs text-ink/60">{s[k] as number} this semester</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section className="py-8">
        <Eyebrow>Now building</Eyebrow>
        <NowBuilding />
      </Section>

      {((recog ?? []) as unknown[]).length > 0 && (
        <Section className="py-8">
          <Eyebrow>Top contributors</Eyebrow>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {((recog ?? []) as { month: string; name: string; reason: string }[]).map((r) => (
              <li key={r.month + r.name} className="border border-line bg-surface p-4"><p className="font-medium text-ink">{r.name}</p><p className="text-sm text-ink/70">{r.reason}</p></li>
            ))}
          </ul>
        </Section>
      )}

      {a && a.evidence.length > 0 && (
        <Section className="pb-24 pt-8">
          <Eyebrow>Completed ✓</Eyebrow>
          <ul className="mt-4 divide-y divide-line border border-line" data-impact-evidence>
            {a.evidence.map((e) => (
              <li key={e.slug} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-ink">{e.published ? <Link href={`/impact/${e.slug}`} className="underline-offset-2 hover:underline">{e.title}</Link> : e.title} <span className="text-sm text-ink/60">· Completed ✓ {new Date(e.done_at).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span></span>
                <span className="flex flex-wrap gap-3 text-sm">{e.links.slice(0, 3).map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="text-accent-text underline">evidence</a>)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
