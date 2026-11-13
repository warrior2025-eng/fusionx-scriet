import type { Metadata } from "next";
import Link from "next/link";
import { IdeaActions, OpportunityActions } from "@/components/autopilot/outcome-parts";
import { dayLabel, getAutopilotViewer, peopleById } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Idea Engine" };

const LABELS: Record<string, string> = {
  pitch: "Pitch", problem: "Problem (who, how often, evidence to collect)", users: "Users", solution: "Solution", different: "What's different", mvp: "MVP scope",
  stack: "Tech stack", data: "Free data and APIs", effort: "Effort", team: "Team per hub", validate: "Validate with real users", measures: "Success measures",
  startup_path: "Startup path", risks: "Risks", opportunity: "Matching opportunity", question: "Question", why: "Why it matters", scope: "Scope", method: "Method",
  data_sources: "Free data sources", tools: "Tools", plan: "10–12 week plan", output: "Expected output", venues: "Venues", ethics: "Ethics", keywords: "Search keywords",
  where_to_search: "Where to search", mentor: "Best-fit Student Mentor", variations: "Variations",
};
const show = (v: unknown): string => Array.isArray(v) ? v.join(" · ") : v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${show(x)}`).join(" | ") : String(v ?? "");

/**
 * The Idea Engine's drafts, labelled "auto" until a person decides: project ideas (adopt → a Projects draft
 * + Flagship mission), research topics (adopt → a Research draft + a mission that starts after the mentor
 * approves) and opportunities from the radar, sorted by value (closeness, urgency, organiser, prizes, fit).
 */
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const [{ data: ideas }, { data: opps }, { data: sources }, { data: members }] = await Promise.all([
    supabase.from("idea_drafts").select("id, kind, title, pitch, data, status, created_at").in("status", sp.show === "all" ? ["draft", "saved", "adopted", "rejected"] : ["draft"]).order("created_at", { ascending: false }).limit(40),
    supabase.from("opportunity_drafts").select("*").eq("status", "draft").gte("deadline", new Date().toISOString().slice(0, 10)).order("value_score", { ascending: false }).limit(40),
    supabase.from("opportunity_sources").select("name, url, region, active, last_fetched_at, last_result").order("region"),
    supabase.from("core_group_members").select("user_id"),
  ]);
  const people = await peopleById(supabase, ((members ?? []) as { user_id: string }[]).map((m) => m.user_id));
  const memberList = [...people.entries()].map(([id, p]) => ({ id, name: p.full_name })).sort((a, b) => a.name.localeCompare(b.name));
  type I = { id: string; kind: "project" | "research"; title: string; pitch: string; data: Record<string, unknown>; status: string; created_at: string };
  type O = { id: string; title: string; organiser: string; kind: string; mode: string | null; city: string | null; distance_km: number | null; deadline: string; dates: string | null; team_size: string | null; eligibility: string | null; fees: string | null; prizes: string | null; official_link: string; source_link: string | null; value_score: number };
  const ideaList = (ideas ?? []) as I[];

  return (
    <div className="space-y-8" data-ideas>
      <p className="text-sm"><Link href="/command/outcomes" className="underline">← Outcomes</Link> · <Link href={sp.show === "all" ? "/command/ideas" : "/command/ideas?show=all"} className="underline">{sp.show === "all" ? "Only drafts" : "All decided ideas too"}</Link></p>
      {(["project", "research"] as const).map((kind) => (
        <section key={kind}>
          <h2 className="font-serif text-xl text-ink">{kind === "project" ? "Project ideas" : "Research topics"}</h2>
          <p className="text-xs text-ink/60">{kind === "project" ? "Three a week by default. Nothing is published on its own." : "Three a month. Papers, authors and DOIs are never invented: search with the keywords and the mentor."}</p>
          {ideaList.filter((i) => i.kind === kind).length === 0 ? <p className="mt-3 border border-dashed border-line p-4 text-sm text-ink/70">No drafts waiting. The Idea Engine runs on its own with the server&apos;s AI key (Control → levels and numbers).</p> : (
            <ul className="mt-3 space-y-3">
              {ideaList.filter((i) => i.kind === kind).map((i) => (
                <li key={i.id} className="border border-line bg-surface p-4" data-idea={i.kind}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">Idea draft · auto · {i.status} · {dayLabel(i.created_at.slice(0, 10))}</p>
                  <h3 className="font-serif text-lg text-ink">{i.title}</h3>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-ink/80">{i.pitch}</summary>
                    <dl className="mt-2 grid gap-1 text-sm">
                      {Object.entries(i.data).filter(([k]) => k !== "title").map(([k, v]) => <div key={k}><dt className="inline font-semibold text-ink">{LABELS[k] ?? k}: </dt><dd className="inline text-ink/80">{show(v)}</dd></div>)}
                    </dl>
                  </details>
                  {i.status === "draft" && <IdeaActions id={i.id} kind={i.kind} members={memberList} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section>
        <h2 className="font-serif text-xl text-ink">Opportunities radar</h2>
        <p className="text-xs text-ink/60">Near Meerut first, then national online, then international. Only items with an official link and an open deadline; repeats merged. The weekly digest task asks a Competitions member to open each link.</p>
        {((opps ?? []) as O[]).length === 0 ? <p className="mt-3 border border-dashed border-line p-4 text-sm text-ink/70">Nothing new from the radar.</p> : (
          <ul className="mt-3 space-y-3">
            {((opps ?? []) as O[]).map((o) => (
              <li key={o.id} className="border border-line bg-surface p-4" data-opportunity-draft>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">Opportunity · auto · value {o.value_score}</p>
                <h3 className="font-medium text-ink">{o.title} <span className="text-sm font-normal text-ink/65">· {o.organiser}</span></h3>
                <p className="text-sm text-ink/75">{o.kind} · {o.mode ?? "online"}{o.city ? ` · ${o.city}` : ""}{o.distance_km !== null ? ` · ~${o.distance_km} km from Meerut` : ""} · deadline {dayLabel(o.deadline)}{o.dates ? ` · ${o.dates}` : ""}{o.team_size ? ` · team ${o.team_size}` : ""}{o.fees ? ` · fees ${o.fees}` : ""}{o.prizes ? ` · ${o.prizes}` : ""}</p>
                {o.eligibility && <p className="text-xs text-ink/65">{o.eligibility}</p>}
                <p className="text-xs"><a href={o.official_link} target="_blank" rel="noopener noreferrer" className="text-accent-text underline">Official link</a>{o.source_link && <> · <a href={o.source_link} target="_blank" rel="noopener noreferrer" className="underline">source</a></>}</p>
                <OpportunityActions id={o.id} ideas={ideaList.filter((i) => i.kind === "project").map((i) => ({ id: i.id, title: i.title }))} />
              </li>
            ))}
          </ul>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Sources ({(sources ?? []).length})</summary>
          <p className="mt-1 text-xs text-ink/60">Fetched at most twice a week, respecting robots.txt; no logins. Edit the list in the database table opportunity_sources.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {((sources ?? []) as { name: string; url: string; region: string; active: boolean; last_fetched_at: string | null; last_result: string | null }[]).map((s) => (
              <li key={s.url}>{s.name} <span className="text-xs text-ink/60">· {s.region} · {s.active ? "on" : "off"}{s.last_fetched_at ? ` · ${s.last_result} ${dayLabel(s.last_fetched_at.slice(0, 10))}` : " · not fetched yet"}</span></li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
