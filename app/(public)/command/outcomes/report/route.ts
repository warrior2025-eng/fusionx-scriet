import { pdfResponse } from "@/lib/admin/export";
import { getAutopilotViewer } from "@/lib/autopilot/server";
import { semesterLabel, semesterStart } from "@/lib/autopilot/outcomes";

/**
 * The Semester Impact Report for the HOD and Director, generated from FusionX records only
 * (migration 0044): outcomes with proof links, events and attendance, competitions, projects,
 * research, contributions and visitors, with the admin's optional foreword and next semester's plan.
 */
export async function GET(request: Request) {
  const viewer = await getAutopilotViewer();
  if (!viewer?.operator) return new Response("Not allowed", { status: 403 });
  const { supabase } = viewer;
  const url = new URL(request.url);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : semesterStart();
  const [{ data: stats }, { data: visits }, { data: foreword }, { data: planned }] = await Promise.all([
    supabase.rpc("ap_impact_stats", { p_from: from }),
    supabase.from("site_visits").select("views").gte("day", from),
    supabase.from("site_content").select("value").eq("key", "autopilot.report_foreword").maybeSingle(),
    supabase.from("missions").select("title, mission_date").in("status", ["planned", "active"]).gte("mission_date", new Date().toISOString().slice(0, 10)).order("mission_date").limit(20),
  ]);
  const s = (stats ?? {}) as Record<string, number> & { evidence?: { title: string; kind: string | null; done_at: string; links: string[]; slug: string; published: boolean }[] };
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
  const views = ((visits ?? []) as { views: number }[]).reduce((n, v) => n + v.views, 0);
  type Row = { section: string; item: string; detail: string };
  const rows: Row[] = [];
  const text = (foreword?.value as { text?: string } | null)?.text?.trim();
  if (text) rows.push({ section: "Foreword", item: text, detail: "" });
  const figures: [string, string][] = [
    ["Missions completed", "missions"], ["Workshops", "workshops"], ["Event attendance", "attendance"], ["Build Nights", "build_nights"], ["Hackathon entries", "hackathons"],
    ["Projects shipped", "projects_shipped"], ["Papers and patent attempts", "research"], ["Posts and digests", "posts"], ["Verified contributions", "contributions"],
    ["Members who contributed", "members"], ["Community and outside contributors", "outside"], ["Departments", "departments"],
  ];
  for (const [label, key] of figures) rows.push({ section: "In numbers", item: label, detail: String(s[key] ?? 0) });
  rows.push({ section: "In numbers", item: "Public page views (counted by FusionX, no cookies)", detail: String(views) });
  for (const e of s.evidence ?? []) {
    rows.push({ section: "Outcomes", item: e.title, detail: [new Date(e.done_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }), ...(e.published ? [`${site}/impact/${e.slug}`] : []), ...e.links].join("  ·  ") });
  }
  for (const m of (planned ?? []) as { title: string; mission_date: string }[]) rows.push({ section: "Next semester plan", item: m.title, detail: m.mission_date });
  return pdfResponse({
    filename: "fusionx-impact-report",
    title: `FusionX Impact Report: ${semesterLabel()}`,
    filters: { "Generated from FusionX records": new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }), From: from },
    rows,
    columns: [{ header: "Section", value: (r) => r.section }, { header: "Item", value: (r) => r.item }, { header: "Detail / proof", value: (r) => r.detail }],
  });
}
