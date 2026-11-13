import { createAdminClient } from "@/lib/supabase/server";
import { GEMINI_MODELS, GROQ_MODEL } from "@/lib/ai/settings";

/**
 * The Idea Engine (migration 0044): project ideas, research topics and an opportunities radar, written
 * as DRAFTS by the system and decided by people in Command Center → Today. SERVER ONLY.
 *
 * Free tools only: the existing GEMINI_API_KEY (Groq as the fallback), a daily cap on calls (Control →
 * "Idea Engine AI calls per day"), and a seeded list of public pages fetched at most twice a week,
 * respecting robots.txt, without logins. Google Search grounding is never used unless switched on in
 * Control (off by default: free on a key without billing, but this code cannot see the key's billing).
 *
 * Everything the model writes is checked here before it is stored: missing fields drop an idea; DOIs
 * and paper citations are removed from research topics; opportunities need an official link and a
 * future deadline, and are merged when they repeat.
 */

type Admin = ReturnType<typeof createAdminClient>;
const GEMINI = (process.env.AI_GEMINI_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const GROQ = (process.env.AI_GROQ_BASE || "https://api.groq.com").replace(/\/$/, "");
const UA = "FusionX-Radar/1.0 (+https://fxscriet.com)";

export const ideaEngineConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);

async function log(admin: Admin, area: string, action: string, reason: string) {
  await admin.from("automation_log").insert({ area, action: action.slice(0, 200), reason: reason.slice(0, 500) });
}

/** Calls made today (IST), from the automation log. */
async function callsToday(admin: Admin): Promise<number> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { count } = await admin.from("automation_log").select("id", { count: "exact", head: true })
    .like("area", "idea\\_%").eq("action", "AI call").gte("at", `${today}T00:00:00+05:30`);
  return count ?? 0;
}

/** One JSON answer from Gemini (each free model in turn), then Groq. Null when none answers or the cap is reached. */
export async function askJson(admin: Admin, area: string, prompt: string, cap: number): Promise<unknown | null> {
  if ((await callsToday(admin)) >= cap) {
    await log(admin, area, "Daily AI cap reached", `Waiting until tomorrow (cap ${cap})`);
    return null;
  }
  await log(admin, area, "AI call", "Idea Engine");
  const parse = (text: string) => {
    const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(t); } catch { const m = /[[{][\s\S]*[\]}]/.exec(t); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } }
  };
  if (process.env.GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) {
      const res = await fetch(`${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: "application/json" } }),
        signal: AbortSignal.timeout(60_000), cache: "no-store",
      }).catch(() => null);
      if (res?.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const out = parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
        if (out) return out;
      }
    }
  }
  if (process.env.GROQ_API_KEY) {
    const res = await fetch(`${GROQ}/openai/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.6, max_tokens: 4096, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60_000), cache: "no-store",
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = parse(data.choices?.[0]?.message?.content ?? "");
      if (out) return out;
    }
  }
  await log(admin, area, "No AI answer", "Gemini and Groq did not answer; trying next run");
  return null;
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 12) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, max) : []);
// DOIs and "Author et al. (2020)"-style citations: never stored (we cannot check them).
const DOI = /\b10\.\d{4,9}\/\S+/gi;
const CITATION = /\b[A-Z][a-z]+ et al\.?,? \(?\d{4}\)?/g;
const scrub = (s: string) => s.replace(DOI, "").replace(CITATION, "").replace(/\s{2,}/g, " ").trim();

export const PROJECT_FIELDS = ["title", "pitch", "problem", "users", "solution", "different", "mvp", "stack", "data", "effort", "variations", "team", "validate", "measures", "startup_path", "risks", "opportunity"] as const;
export const RESEARCH_FIELDS = ["title", "question", "why", "scope", "method", "data_sources", "tools", "plan", "output", "venues", "ethics", "keywords", "where_to_search"] as const;

/** Weekly: N project ideas from our hubs, members' skills, existing projects (no repeats) and open opportunities. */
export async function draftProjectIdeas(admin: Admin, count: number, cap: number): Promise<number> {
  const [{ data: skills }, { data: projects }, { data: opps }, { data: past }] = await Promise.all([
    admin.from("profiles").select("skills").eq("is_active", true),
    admin.from("projects").select("title"),
    admin.from("opportunities").select("title, deadline").eq("is_published", true).gte("deadline", new Date().toISOString().slice(0, 10)).limit(15),
    admin.from("idea_drafts").select("title, status, reject_reason").eq("kind", "project").order("created_at", { ascending: false }).limit(60),
  ]);
  const counts = new Map<string, number>();
  for (const p of skills ?? []) for (const s of (p.skills as string[]) ?? []) counts.set(s.toLowerCase(), (counts.get(s.toLowerCase()) ?? 0) + 1);
  const skillLine = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([s, n]) => `${s} ×${n}`).join(", ");
  const prompt = `You help FusionX@SCRIET, a student innovation club at SCRIET, CCS University, Meerut (Uttar Pradesh, India), find startup-level project ideas.
Hubs: Design & Branding; Competitions & Opportunities; Projects, Research & Startups; FusionX Event Crew.
Members' skills (counts): ${skillLine || "unknown"}.
Existing projects (do NOT repeat or closely copy): ${(projects ?? []).map((p) => p.title).join("; ") || "none"}.
Ideas already drafted or rejected (do NOT repeat): ${(past ?? []).map((p) => `${p.title}${p.status === "rejected" ? ` (rejected: ${p.reject_reason ?? ""})` : ""}`).join("; ") || "none"}.
Open opportunities: ${(opps ?? []).map((o) => `${o.title} (deadline ${o.deadline})`).join("; ") || "none"}.
Write exactly ${count} ideas for real problems on campus or in the Meerut region. Be concrete and honest; never invent statistics, studies or products. Name a similar product ONLY if you are sure it exists, otherwise write "check similar products".
Reply with JSON: {"ideas":[{"title":"","pitch":"one line","problem":"who has it, how often, what evidence to collect","users":"","solution":"","different":"","mvp":"","stack":"fits the skills above","data":"free data or APIs","effort":"S|M|L","variations":{"lite":["milestones"],"standard":["milestones"],"ambitious":["milestones"]},"team":{"Design & Branding":"","Competitions & Opportunities":"","Projects, Research & Startups":"","FusionX Event Crew":""},"validate":"how to test with real users","measures":"success measures","startup_path":"who pays or adopts; incubation or grant routes to check","risks":"","opportunity":"matching open opportunity or empty"}]}`;
  const out = (await askJson(admin, "idea_projects", prompt, cap)) as { ideas?: Record<string, unknown>[] } | null;
  let n = 0;
  for (const idea of (out?.ideas ?? []).slice(0, count)) {
    const data: Record<string, unknown> = {};
    for (const f of PROJECT_FIELDS) data[f] = f === "variations" || f === "team" ? idea[f] ?? null : str(idea[f], 800);
    // Every field is needed, except a matching opportunity (often there is none).
    if (PROJECT_FIELDS.some((f) => f !== "opportunity" && !data[f])) continue;
    if ((projects ?? []).some((p) => p.title.toLowerCase() === str(idea.title).toLowerCase())) continue;
    const { data: row } = await admin.from("idea_drafts").insert({ kind: "project", title: str(idea.title, 160), pitch: str(idea.pitch, 400), data }).select("id, title").single();
    if (row) { await suggestIdea(admin, row.id as string, "project", row.title as string); n++; }
  }
  return n;
}

/** Monthly: N undergraduate research topics. Never invents papers: citations and DOIs are stripped; venues only "if sure". */
export async function draftResearchTopics(admin: Admin, count: number, cap: number): Promise<number> {
  const [{ data: mentors }, { data: past }] = await Promise.all([
    admin.from("mentors").select("user_id, name, role_title, expertise").eq("is_published", true),
    admin.from("idea_drafts").select("title").eq("kind", "research").order("created_at", { ascending: false }).limit(40),
  ]);
  const prompt = `Suggest exactly ${count} undergraduate-friendly, one-semester, low-cost research topics for engineering students at SCRIET, CCS University, Meerut, India.
Do not repeat: ${(past ?? []).map((p) => p.title).join("; ") || "none"}.
STRICT: Do NOT cite or name any paper, author or DOI. For data sources name only well-known public datasets you are sure exist, else write "verify". For venues write a venue only if you are sure it fits, else "find with your mentor".
Reply with JSON: {"topics":[{"title":"","question":"","why":"","scope":"","method":"","data_sources":"","tools":"","plan":["week 1-2: ...", "... 10-12 weeks"],"output":"","venues":"","ethics":"","keywords":["search keywords"],"where_to_search":"Google Scholar, arXiv, IEEE Xplore, Semantic Scholar"}]}`;
  const out = (await askJson(admin, "idea_research", prompt, cap)) as { topics?: Record<string, unknown>[] } | null;
  let n = 0;
  for (const t of (out?.topics ?? []).slice(0, count)) {
    const data: Record<string, unknown> = {};
    for (const f of RESEARCH_FIELDS) data[f] = f === "plan" || f === "keywords" ? list(t[f]).map(scrub) : scrub(str(t[f], 800));
    data.where_to_search = "Google Scholar, arXiv, IEEE Xplore, Semantic Scholar";
    if (RESEARCH_FIELDS.some((f) => (Array.isArray(data[f]) ? (data[f] as string[]).length === 0 : !data[f]))) continue;
    // Best-fit Student Mentor, chosen here from expertise (not by the model).
    const words = `${data.title} ${data.question} ${(data.keywords as string[]).join(" ")}`.toLowerCase();
    const fit = (mentors ?? []).filter((m) => m.user_id).map((m) => ({ m, score: ((m.expertise as string[]) ?? []).filter((e) => words.includes(e.toLowerCase())).length + (/student mentor/i.test(m.role_title as string) ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score)[0]?.m;
    data.mentor = fit ? `${fit.name} (${fit.role_title})` : "Choose a Student Mentor";
    const { data: row } = await admin.from("idea_drafts").insert({ kind: "research", title: scrub(str(t.title, 160)), pitch: scrub(str(t.question, 400)), data, mentor_id: fit?.user_id ?? null }).select("id, title").single();
    if (row) { await suggestIdea(admin, row.id as string, "research", row.title as string); n++; }
  }
  return n;
}

async function suggestIdea(admin: Admin, id: string, kind: "project" | "research", title: string) {
  await admin.from("autopilot_queue").insert({
    area: kind === "project" ? "idea_projects" : "idea_research", kind: "idea_draft",
    title: `Idea draft · auto: ${title}`, detail: kind === "project" ? "Adopt as a Projects draft + Flagship mission, save for members, or reject." : "Adopt as a Research draft + mission (starts after the mentor approves), or reject.",
    payload: { idea_id: id }, dedupe: `idea:${id}`, safe: false, hub: "projects-research-startups",
  });
}

// ── Opportunities radar ──────────────────────────────────────────────────

const MEERUT = { lat: 28.9845, lon: 77.7064 };
const CITIES: Record<string, [number, number]> = {
  meerut: [28.98, 77.71], delhi: [28.61, 77.21], "new delhi": [28.61, 77.21], noida: [28.54, 77.39], ghaziabad: [28.67, 77.45], gurugram: [28.46, 77.03], gurgaon: [28.46, 77.03],
  roorkee: [29.87, 77.89], kanpur: [26.45, 80.33], dehradun: [30.32, 78.03], lucknow: [26.85, 80.95], agra: [27.18, 78.01], jaipur: [26.91, 75.79], chandigarh: [30.73, 76.78],
  mumbai: [19.08, 72.88], bengaluru: [12.97, 77.59], bangalore: [12.97, 77.59], hyderabad: [17.39, 78.49], chennai: [13.08, 80.27], pune: [18.52, 73.86], kolkata: [22.57, 88.36],
};
export function distanceKm(city: string | null | undefined): number | null {
  const c = CITIES[(city ?? "").toLowerCase().trim()];
  if (!c) return null;
  const r = Math.PI / 180, dLat = (c[0] - MEERUT.lat) * r, dLon = (c[1] - MEERUT.lon) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(MEERUT.lat * r) * Math.cos(c[0] * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 1.25); // by road, roughly
}

/** Sorting value: closeness, urgency, organiser, prizes, hub fit, a team size we can field. */
export function valueScore(o: { distance_km: number | null; mode: string; deadline: string; organiser: string; prizes: string; hubs: string[]; team_size: string }, today = new Date()): number {
  const days = (new Date(`${o.deadline}T00:00:00Z`).getTime() - today.getTime()) / 864e5;
  let s = 0;
  s += o.distance_km === null ? (/online/i.test(o.mode) ? 15 : 5) : o.distance_km <= 120 ? 30 : o.distance_km <= 350 ? 22 : 8;
  s += days < 3 ? 2 : days <= 21 ? 20 : days <= 45 ? 12 : 6;
  s += /\b(IIT|NIT|IIIT|DTU|NSUT|Government|Ministry|AICTE|MLH|Smart India)\b/i.test(o.organiser) ? 20 : 8;
  s += o.prizes ? 10 : 0;
  s += Math.min(o.hubs.length, 3) * 4;
  const max = Number((/(\d+)\s*$/.exec(o.team_size) ?? [])[1] ?? 4);
  s += max >= 2 && max <= 6 ? 8 : 3;
  return Math.round(s);
}

/** robots.txt: is this path allowed for us (User-agent: * rules)? */
async function robotsAllow(url: URL): Promise<boolean> {
  const res = await fetch(`${url.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return true;
  const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
  let applies = false;
  const rules: { allow: boolean; path: string }[] = [];
  for (const l of lines) {
    const [k, ...rest] = l.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*" || /fusionx/i.test(v);
    else if (applies && /^disallow$/i.test(k) && v) rules.push({ allow: false, path: v });
    else if (applies && /^allow$/i.test(k) && v) rules.push({ allow: true, path: v });
  }
  const match = rules.filter((r) => url.pathname.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  return match ? match.allow : true;
}

const pageText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, " [link $1] ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").slice(0, 30_000);

/** Twice a week: fetch the active sources (robots.txt respected), ask the model to list opportunities, keep the valid ones. */
export async function runRadar(admin: Admin, cap: number, grounding: boolean): Promise<{ drafts: number; skipped: string[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const skipped: string[] = [];
  if (grounding) {
    // Off by default. Never retried on a failure; the reason is logged and the seeded sources carry on.
    await log(admin, "idea_radar", "Grounding skipped", "Search grounding is not used by this version; seeded sources and suggestions only");
  }
  const { data: sources } = await admin.from("opportunity_sources").select("*").eq("active", true);
  const texts: string[] = [];
  for (const s of sources ?? []) {
    const url = new URL(s.url as string);
    if (!(await robotsAllow(url))) { skipped.push(`${s.name}: robots.txt`); await admin.from("opportunity_sources").update({ last_fetched_at: new Date().toISOString(), last_result: "robots.txt disallows" }).eq("id", s.id); continue; }
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20_000), redirect: "follow" }).catch(() => null);
    const ok = res?.ok && (res.headers.get("content-type") ?? "").includes("html");
    await admin.from("opportunity_sources").update({ last_fetched_at: new Date().toISOString(), last_result: ok ? "fetched" : `failed ${res?.status ?? "network"}` }).eq("id", s.id);
    if (ok) texts.push(`SOURCE ${s.name} (${s.url}, region ${s.region}):\n${pageText(await res!.text())}`);
    else skipped.push(`${s.name}: ${res?.status ?? "network"}`);
  }
  if (texts.length === 0) { await log(admin, "idea_radar", "Radar found no readable source", skipped.join("; ")); return { drafts: 0, skipped }; }
  const prompt = `From the page texts below, list student opportunities (hackathons, coding contests, ideathons, case/design/pitch competitions, research calls, student internships or fellowships, tech fests) whose registration deadline is after ${today}.
Use ONLY what the pages say. Never guess a link, date, prize or fee: leave it empty if not stated. "official_link" must be the event's own page or registration link as written in the text ([link ...]); if there is none, leave it empty.
Reply with JSON: {"items":[{"title":"","organiser":"","type":"","mode":"online|offline|hybrid","city":"","deadline":"YYYY-MM-DD","dates":"","team_size":"","eligibility":"","fees":"","prizes":"","official_link":"","source_link":"","hubs":["design-branding|competitions-opportunities|projects-research-startups|event-crew"]}]}

${texts.join("\n\n").slice(0, 60_000)}`;
  const out = (await askJson(admin, "idea_radar", prompt, cap)) as { items?: Record<string, unknown>[] } | null;
  return { drafts: await storeRadarItems(admin, out?.items ?? [], today), skipped };
}

/** The rules every radar item must pass (also used for members' "Suggest an opportunity"). */
export async function storeRadarItems(admin: Admin, items: Record<string, unknown>[], today: string): Promise<number> {
  let n = 0;
  for (const it of items) {
    const official = str(it.official_link, 500);
    const deadline = str(it.deadline, 10);
    if (!/^https?:\/\/\S+$/i.test(official) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today) continue; // no link / no deadline / past: dropped
    const title = str(it.title, 160), organiser = str(it.organiser, 120) || new URL(official).hostname;
    if (!title) continue;
    const city = str(it.city, 60), mode = str(it.mode, 20) || (city ? "offline" : "online");
    const hubs = list(it.hubs, 4).filter((h) => ["design-branding", "competitions-opportunities", "projects-research-startups", "event-crew"].includes(h));
    const dist = distanceKm(city);
    const row = {
      title, organiser, kind: str(it.type, 60) || "hackathon", mode, city: city || null, distance_km: dist, deadline,
      dates: str(it.dates, 120) || null, team_size: str(it.team_size, 40) || null, eligibility: str(it.eligibility, 300) || null,
      fees: str(it.fees, 80) || null, prizes: str(it.prizes, 200) || null, official_link: official, source_link: str(it.source_link, 500) || null,
      hubs: hubs.length ? hubs : ["competitions-opportunities"],
      value_score: valueScore({ distance_km: dist, mode, deadline, organiser, prizes: str(it.prizes), hubs, team_size: str(it.team_size) }),
      // Duplicates merge: same event, same organiser.
      dedupe_key: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${organiser.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
    };
    const { data, error } = await admin.from("opportunity_drafts").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    if (error || !data?.length) continue;
    const already = await admin.from("opportunities").select("id", { head: true, count: "exact" }).eq("registration_url", official);
    if ((already.count ?? 0) > 0) { await admin.from("opportunity_drafts").update({ status: "published" }).eq("id", data[0].id); continue; }
    await admin.from("autopilot_queue").insert({
      area: "idea_radar", kind: "opportunity_draft", title: `Opportunity · auto: ${title} (${organiser})`,
      detail: `Deadline ${deadline}${dist !== null ? ` · ~${dist} km from Meerut` : mode === "online" ? " · online" : ""} · value ${row.value_score} · official link: ${official}`,
      payload: { draft_id: data[0].id }, dedupe: `opp:${data[0].id}`, safe: false, hub: "competitions-opportunities",
    });
    n++;
  }
  return n;
}

/** Called by the cron route: runs what is due, by the levels in Control. */
export async function runIdeaEngine(): Promise<Record<string, unknown>> {
  if (!ideaEngineConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const { data: s } = await admin.from("autopilot_settings").select("master, levels, numbers").eq("id", 1).maybeSingle();
  if (!s || s.master !== "on") return { state: "paused" };
  const levels = (s.levels ?? {}) as Record<string, string>;
  const nums = (s.numbers ?? {}) as Record<string, number>;
  const cap = nums.idea_daily_cap ?? 20;
  const due = async (area: string, days: number) => {
    const { data } = await admin.from("automation_log").select("at").eq("area", area).eq("action", "AI call").order("at", { ascending: false }).limit(1).maybeSingle();
    return !data || Date.now() - new Date(data.at as string).getTime() >= days * 864e5 - 36e5;
  };
  const out: Record<string, unknown> = {};
  if ((levels.idea_projects ?? "suggest") !== "manual" && (nums.idea_projects_per_week ?? 3) > 0 && (await due("idea_projects", 7))) out.projects = await draftProjectIdeas(admin, nums.idea_projects_per_week ?? 3, cap);
  if ((levels.idea_research ?? "suggest") !== "manual" && (nums.idea_research_per_month ?? 3) > 0 && (await due("idea_research", 30))) out.research = await draftResearchTopics(admin, nums.idea_research_per_month ?? 3, cap);
  if ((levels.idea_radar ?? "suggest") !== "manual" && (await due("idea_radar", 3.5))) out.radar = await runRadar(admin, cap, nums.radar_grounding === 1);
  return out;
}
