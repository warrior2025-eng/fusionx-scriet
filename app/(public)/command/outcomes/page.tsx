import type { Metadata } from "next";
import Link from "next/link";
import { NowBuilding } from "@/components/autopilot/now-building";
import { CertificateTools, Foreword, HideToggle, PublishNow, RevokeCertificate, StorySummary } from "@/components/autopilot/outcome-parts";
import { dayLabel, getAutopilotViewer, peopleById, todayIST } from "@/lib/autopilot/server";
import { semesterStart } from "@/lib/autopilot/outcomes";

export const metadata: Metadata = { title: "Command Center · Outcomes" };

/**
 * Outcomes (migration 0044): the public pages as they are now, story pages, certificates, recognition,
 * visitors and the Semester Impact Report. Everything public comes from verified records.
 */
export default async function OutcomesPage() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const from = semesterStart();
  const today = todayIST();
  const monthAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const [{ data: done }, { data: stats }, { data: certs }, { data: visits }, { data: foreword }, { count: ideas }, { count: opps }] = await Promise.all([
    supabase.from("missions").select("id, slug, title, done_at, story_summary, visibility, public_hidden").eq("status", "done").order("done_at", { ascending: false }).limit(30),
    supabase.rpc("ap_impact_stats", { p_from: from }),
    supabase.from("certificate_verifications").select("code, user_id, holder, period_label, status, issued_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("site_visits").select("day, path_group, views").gte("day", monthAgo),
    supabase.from("site_content").select("value").eq("key", "autopilot.report_foreword").maybeSingle(),
    supabase.from("idea_drafts").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("opportunity_drafts").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);
  const s = (stats ?? {}) as Record<string, number>;
  const v = (visits ?? []) as { day: string; path_group: string; views: number }[];
  const byGroup = new Map<string, number>();
  for (const x of v) byGroup.set(x.path_group, (byGroup.get(x.path_group) ?? 0) + x.views);
  const total = v.reduce((n, x) => n + x.views, 0);
  const threeDaysAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 3 * 864e5).toISOString().slice(0, 10);
  const story = (m: { done_at: string | null; story_summary: string | null }) => !!m.story_summary || (!!m.done_at && m.done_at.slice(0, 10) <= threeDaysAgo);
  type C = { code: string; user_id: string; holder: string; period_label: string; status: string; issued_at: string | null };
  const names = await peopleById(supabase, ((certs ?? []) as C[]).map((c) => c.user_id));

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-outcomes>
      <section className="border border-line bg-surface p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg text-ink">Now building (public preview)</h2>
          <div className="flex gap-3 text-sm"><PublishNow /><Link href="/impact" className="self-center underline">Open /impact</Link></div>
        </div>
        <p className="mb-3 text-xs text-ink/60">Exactly what visitors see: positive, from verified work. Stuck, paused and hidden missions are left out on their own.</p>
        <NowBuilding />
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">This semester (Impact Board)</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {[["Missions done", "missions"], ["Workshops", "workshops"], ["Attendance", "attendance"], ["Hackathon entries", "hackathons"], ["Projects shipped", "projects_shipped"], ["Verified contributions", "contributions"], ["Outside contributors", "outside"]].map(([l, k]) => (
            <div key={k} className="flex justify-between"><dt className="text-ink/70">{l}</dt><dd className="tabular-nums text-ink">{s[k] ?? 0}</dd></div>
          ))}
        </dl>
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-sm font-semibold text-ink">Semester Impact Report</h3>
          <p className="text-xs text-ink/60">A PDF for the HOD and Director, generated from FusionX records.</p>
          <a href="/command/outcomes/report" className="mt-2 inline-block text-sm text-accent-text underline" data-report>Download the report (PDF)</a>
          <div className="mt-3"><Foreword initial={(foreword?.value as { text?: string } | null)?.text ?? ""} /></div>
        </div>
      </section>

      <section className="border border-line bg-surface p-4" data-visitors>
        <h2 className="font-serif text-lg text-ink">Visitors (last 30 days)</h2>
        <p className="text-xs text-ink/60">Public page views, counted by FusionX without cookies. Vercel Web Analytics has the detailed view.</p>
        <p className="mt-2 font-serif text-3xl tabular-nums text-ink">{total}</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 text-sm">{[...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, n]) => <li key={g} className="flex justify-between"><span className="text-ink/70">/{g === "home" ? "" : g}</span><span className="tabular-nums">{n}</span></li>)}</ul>
      </section>

      <section className="border border-line bg-surface p-4 lg:col-span-2">
        <h2 className="font-serif text-lg text-ink">Story pages</h2>
        <p className="text-xs text-ink/60">A done public mission&apos;s story publishes when a lead writes 2–3 lines, or 3 days after it is done with only the factual timeline.</p>
        <ul className="mt-3 divide-y divide-line">
          {((done ?? []) as { id: string; slug: string; title: string; done_at: string | null; story_summary: string | null; visibility: string; public_hidden: boolean }[]).map((m) => (
            <li key={m.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink">{m.title} <span className="text-xs text-ink/60">· {m.visibility === "public" ? (m.public_hidden ? "hidden" : story(m) ? "story live" : "story in 3 days") : "members only"}{m.done_at ? ` · done ${dayLabel(m.done_at.slice(0, 10))}` : ""}</span></span>
                <span className="flex gap-3">{m.visibility === "public" && story(m) && !m.public_hidden && <Link href={`/impact/${m.slug}`} className="text-xs underline">Open</Link>}{m.visibility === "public" && <HideToggle kind="mission" id={m.id} hidden={m.public_hidden} />}</span>
              </div>
              {m.visibility === "public" && <StorySummary missionId={m.id} initial={m.story_summary} />}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-line bg-surface p-4 lg:col-span-2">
        <h2 className="font-serif text-lg text-ink">Certificates and recognition</h2>
        <p className="mb-3 text-xs text-ink/60">Drafts list verified contributions only and wait in Today for one-click confirmation. Top contributors are published only after an admin confirms.</p>
        {viewer.admin && <CertificateTools />}
        <ul className="mt-3 divide-y divide-line text-sm">
          {((certs ?? []) as C[]).map((c) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{names.get(c.user_id)?.full_name ?? c.holder} <span className="text-xs text-ink/60">· {c.period_label} · {c.status}{c.issued_at ? ` ${dayLabel(c.issued_at.slice(0, 10))}` : ""} · {c.code}</span></span>
              <span className="flex gap-3">{c.status === "issued" && <><Link href={`/verify/${c.code}`} className="text-xs underline">Verify page</Link><a href={`/api/autopilot/certificate/${c.code}`} className="text-xs underline">PDF</a>{viewer.admin && <RevokeCertificate code={c.code} />}</>}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-line bg-surface p-4 lg:col-span-2">
        <h2 className="font-serif text-lg text-ink">Idea Engine</h2>
        <p className="text-sm text-ink/70">{ideas ?? 0} idea draft{ideas === 1 ? "" : "s"} and {opps ?? 0} opportunit{opps === 1 ? "y" : "ies"} waiting. <Link href="/command/ideas" className="text-accent-text underline">Open the Idea Engine</Link></p>
      </section>
    </div>
  );
}
