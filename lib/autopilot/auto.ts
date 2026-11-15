import { createAdminClient } from "@/lib/supabase/server";
import { TOOL_CANDIDATES } from "@/lib/tools/candidates";
import { PROJECT_FIELDS, RESEARCH_FIELDS, askJson, distanceKm, ideaEngineConfigured, list, log, pageText, robotsAllow, str, valueScore, type Admin } from "./ideas";

/**
 * Autopilot, automatic (migration 0045). SERVER ONLY. Each job runs at its time from the cron route:
 *   tools 6:00 · opportunities 7:00 · AI knowledge 7:30 · ideas Sunday 9:00 · research first Sunday 9:00 (IST)
 * and respects the master switch, its own pause, its level (Auto / Suggest / Manual) and the daily AI cap.
 * Everything it writes is labelled "auto"; links are shown only after they load (HTTP 200).
 */

const UA = "FusionX-LinkCheck/1.0 (+https://fxscriet.com)";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type Settings = { master: string; levels: Record<string, string>; numbers: Record<string, number>; feature_pauses: Record<string, unknown> };
async function settings(admin: Admin): Promise<Settings | null> {
  const { data } = await admin.from("autopilot_settings").select("master, levels, numbers, feature_pauses").eq("id", 1).maybeSingle();
  return (data as Settings | null) ?? null;
}
/** Whether a job may run now: master on, its own automation not paused, its level not Manual. */
async function gate(admin: Admin, feature: string, area: string): Promise<{ ok: true; s: Settings; level: string } | { ok: false; why: string }> {
  const s = await settings(admin);
  if (!s) return { ok: false, why: "no settings (migration 0045?)" };
  if (s.master !== "on") return { ok: false, why: "Autopilot is paused" };
  if (s.feature_pauses?.[feature]) return { ok: false, why: `${feature} is paused` };
  const level = s.levels?.[area] ?? "suggest";
  if (level === "manual") return { ok: false, why: `${area} is on Manual` };
  return { ok: true, s, level };
}

/** A link is shown only when it loads (200, following redirects). */
export async function linkLoads(url: string): Promise<boolean> {
  if (!/^https?:\/\/\S+$/i.test(url)) return false;
  for (const method of ["HEAD", "GET"] as const) {
    const res = await fetch(url, { method, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
    if (res?.status === 200) return true;
    if (res && method === "HEAD" && ![403, 405, 501].includes(res.status)) return false;
  }
  return false;
}

// ── Ideas: 15 every Sunday, levelled ────────────────────────────────────

/** How many ideas per level (1–5) this week: mostly beginner at first, one step up every 4 weeks, at most 3 at level 5. */
export function levelMix(week: number, total = 15, likedLevel: number | null = null): number[] {
  const steps = [[8, 5, 2, 0, 0], [4, 6, 4, 1, 0], [2, 5, 5, 2, 1], [1, 3, 5, 4, 2], [0, 2, 5, 5, 3]];
  const base = [...steps[Math.min(steps.length - 1, Math.floor((Math.max(1, week) - 1) / 4))]];
  // Members mostly accept one level: one more at the next level, taken from the lowest level that has some.
  if (likedLevel && likedLevel < 5) {
    const from = base.findIndex((n) => n > 0);
    if (from >= 0 && from < likedLevel) { base[from]--; base[likedLevel]++; }
  }
  base[4] = Math.min(base[4], 3);
  const sum = base.reduce((a, b) => a + b, 0);
  base[1] += total - sum; // keep the total
  return base;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
/** Near-duplicates: most words of the title and pitch the same. */
export function similar(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size) >= 0.6;
}

type Idea = Record<string, unknown> & { title: string; pitch: string; level: number; learn: string };

export async function weeklyIdeas(force = false): Promise<Record<string, unknown>> {
  if (!ideaEngineConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const g = await gate(admin, "ideas", "ideas_members");
  if (!g.ok) { await log(admin, "idea_projects", "Weekly ideas skipped", g.why); return { state: "skipped", why: g.why }; }
  const today = todayIST();
  const { count: already } = await admin.from("idea_drafts").select("id", { count: "exact", head: true }).eq("kind", "project").eq("batch_date", today).is("deleted_at", null);
  if ((already ?? 0) > 0 && !force) return { state: "done_today" };
  const want = g.s.numbers?.ideas_per_week ?? 15;
  const minScore = g.s.numbers?.idea_min_quality ?? 7;
  const cap = g.s.numbers?.idea_daily_cap ?? 20;

  // The week number (batches so far + 1), and the level members accepted most in the last 4 weeks.
  const { data: batches } = await admin.from("idea_drafts").select("batch_date").eq("kind", "project").not("batch_date", "is", null).is("deleted_at", null);
  const week = new Set((batches ?? []).map((b) => b.batch_date as string)).size + 1;
  const since = new Date(Date.now() - 28 * 864e5).toISOString();
  const { data: accepted } = await admin.from("projects").select("idea:idea_drafts(level)").not("idea_id", "is", null).gte("created_at", since);
  const byLevel = new Map<number, number>();
  for (const a of (accepted ?? []) as unknown as { idea: { level: number | null } | null }[]) if (a.idea?.level) byLevel.set(a.idea.level, (byLevel.get(a.idea.level) ?? 0) + 1);
  const liked = [...byLevel.entries()].sort((a, b) => b[1] - a[1])[0];
  const mix = levelMix(week, want, liked && liked[1] >= 3 ? liked[0] : null);

  // Context and what must not repeat (12 weeks of ideas and every project).
  const [{ data: skills }, { data: projects }, { data: recent }, { data: opps }] = await Promise.all([
    admin.from("profiles").select("skills").eq("is_active", true),
    admin.from("projects").select("title, description"),
    admin.from("idea_drafts").select("title, pitch").eq("kind", "project").gte("created_at", new Date(Date.now() - 84 * 864e5).toISOString()),
    admin.from("opportunities").select("title, deadline").eq("is_published", true).limit(15),
  ]);
  const counts = new Map<string, number>();
  for (const p of skills ?? []) for (const s of (p.skills as string[]) ?? []) counts.set(s.toLowerCase(), (counts.get(s.toLowerCase()) ?? 0) + 1);
  const avoid = [...(projects ?? []).map((p) => `${p.title}`), ...(recent ?? []).map((r) => `${r.title}`)];
  const levelText = mix.map((n, i) => (n ? `${Math.ceil(n * 1.5)} at level ${i + 1}` : "")).filter(Boolean).join(", ");
  const generate = async (extra: number) => {
    const prompt = `You help FusionX@SCRIET, a student innovation club at SCRIET, CCS University, Meerut (Uttar Pradesh, India), with project ideas for ALL its members (any branch, any year).
Levels: 1 Beginner (1–2 weeks, simple stack), 2 Easy, 3 Intermediate, 4 Advanced, 5 Startup-grade.
Write project ideas: ${extra ? `${extra} more, any levels` : levelText}. Real problems on campus or in the Meerut region. Simple English.
Members' skills (counts): ${[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([s, n]) => `${s} ×${n}`).join(", ") || "unknown"}.
Do NOT repeat or closely copy: ${avoid.slice(0, 120).join("; ") || "none"}.
Open opportunities: ${(opps ?? []).map((o) => o.title).join("; ") || "none"}.
Never invent statistics, studies, prices or products. Name a similar product only if sure, else "check similar products".
Reply with JSON: {"ideas":[{"level":1,"learn":"one line: what you'll learn","hubs":["design|competitions|projects|events"],"title":"","pitch":"one line","problem":"who has it, how often, evidence to collect","users":"","solution":"","different":"","mvp":"","stack":"comma separated","data":"free data or APIs","effort":"S|M|L","variations":{"lite":["milestones"],"standard":["milestones"],"ambitious":["milestones"]},"team":{"Design & Branding":"","Competitions & Opportunities":"","Projects, Research & Startups":"","FusionX Event Crew":""},"validate":"","measures":"","startup_path":"","risks":"","opportunity":""}]}`;
    const out = (await askJson(admin, "idea_projects", prompt, cap)) as { ideas?: Record<string, unknown>[] } | null;
    return (out?.ideas ?? []).map((i): Idea => {
      const data: Record<string, unknown> = {};
      for (const f of PROJECT_FIELDS) data[f] = f === "variations" || f === "team" ? i[f] ?? null : str(i[f], 800);
      return { ...data, hubs: list(i.hubs, 4), title: str(i.title, 160), pitch: str(i.pitch, 400), level: Math.min(5, Math.max(1, Number(i.level) || 1)), learn: str(i.learn, 200) } as Idea;
    }).filter((i) => i.title && i.learn && PROJECT_FIELDS.every((f) => f === "opportunity" || i[f]));
  };
  // Second pass: an AI score (1–10) for usefulness, originality, student feasibility, clarity and completeness.
  const score = async (ideas: Idea[]) => {
    if (!ideas.length) return [] as number[];
    const prompt = `Score each student project idea from 1 to 10 for usefulness, originality, feasibility for students, clarity and completeness. Be strict.
Reply with JSON: {"scores":[{"i":0,"score":7}]}
${ideas.map((x, i) => `${i}. [L${x.level}] ${x.title}: ${x.pitch} | MVP: ${x.mvp} | Stack: ${x.stack}`).join("\n")}`;
    const out = (await askJson(admin, "idea_projects", prompt, cap)) as { scores?: { i: number; score: number }[] } | null;
    const map = new Map((out?.scores ?? []).map((s) => [Number(s.i), Number(s.score)]));
    return ideas.map((_, i) => map.get(i) ?? 0);
  };
  const keep: (Idea & { score: number })[] = [];
  const take = (pool: Idea[], scores: number[]) => {
    pool.map((x, i) => ({ ...x, score: scores[i] })).filter((x) => x.score >= minScore).sort((a, b) => b.score - a.score).forEach((x) => {
      if (keep.length >= want) return;
      if (keep.some((k) => similar(`${k.title} ${k.pitch}`, `${x.title} ${x.pitch}`))) return;
      if (avoid.some((a) => similar(a, x.title))) return;
      // Level mix: no more than this week's share per level (extra slots fill from any level later).
      if (keep.filter((k) => k.level === x.level).length >= mix[x.level - 1]) return;
      keep.push(x);
    });
  };
  const first = await generate(0);
  take(first, await score(first));
  if (keep.length < want) {
    // Retry once; then fill any level that came short from the best of the rest.
    const more = await generate(want - keep.length + 4);
    const all = [...first.filter((f) => !keep.some((k) => k.title === f.title)), ...more];
    const sc = await score(all);
    take(all, sc);
    if (keep.length < want) {
      all.map((x, i) => ({ ...x, score: sc[i] })).filter((x) => x.score >= minScore && !keep.some((k) => k.title === x.title || similar(`${k.title} ${k.pitch}`, `${x.title} ${x.pitch}`)))
        .sort((a, b) => b.score - a.score).slice(0, want - keep.length).forEach((x) => keep.push(x));
    }
  }
  if (keep.length === 0) { await log(admin, "idea_projects", "No ideas passed the quality bar", `minimum ${minScore}; trying next run`); return { state: "none" }; }
  const deliver = g.level === "auto";
  const rows = keep.map(({ title, pitch, level, learn, score: sc, ...rest }) => ({
    kind: "project", title, pitch, level, learn, score: sc, data: rest, batch_date: today, status: deliver ? "published" : "draft", published_at: deliver ? new Date().toISOString() : null,
  }));
  const { error } = await admin.from("idea_drafts").insert(rows);
  if (error) { await log(admin, "idea_projects", "Ideas not saved", error.message); return { state: "failed" }; }
  if (deliver) {
    await admin.rpc("ap_notify_everyone", { p_title: `${rows.length} new project ideas are waiting in My work`, p_body: "Pick one to start, save it for later, or hide it.", p_link: "/my-work#ideas" });
    await log(admin, "idea_projects", `Delivered ${rows.length} project ideas to everyone`, `Week ${week} · levels ${mix.join("/")}`);
  } else {
    await admin.from("autopilot_queue").insert({ area: "ideas_members", kind: "deliver_ideas", title: `Deliver this week's ${rows.length} project ideas`, detail: "Ideas · auto. Approve to send them to everyone's My work.",
      payload: { batch_date: today }, dedupe: `ideas:${today}`, safe: false });
  }
  return { state: deliver ? "delivered" : "suggested", count: rows.length, week, mix };
}

/** First Sunday of the month: research topics to everyone's My work (adopting still needs a mentor). */
export async function monthlyResearch(force = false): Promise<Record<string, unknown>> {
  if (!ideaEngineConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const d = new Date(`${todayIST()}T00:00:00Z`);
  if (!force && d.getUTCDate() > 7) return { state: "not_first_sunday" };
  const admin = createAdminClient();
  const g = await gate(admin, "research", "ideas_members");
  if (!g.ok) { await log(admin, "idea_research", "Research topics skipped", g.why); return { state: "skipped", why: g.why }; }
  const { draftResearchTopics } = await import("./ideas");
  const n = await draftResearchTopics(admin, g.s.numbers?.idea_research_per_month ?? 3, g.s.numbers?.idea_daily_cap ?? 20);
  if (g.level === "auto" && n > 0) {
    const today = todayIST();
    await admin.from("idea_drafts").update({ status: "published", published_at: new Date().toISOString(), batch_date: today }).eq("kind", "research").eq("status", "draft").is("published_at", null);
    await admin.from("autopilot_queue").update({ status: "done" }).eq("kind", "idea_draft").eq("area", "idea_research").eq("status", "pending");
    await admin.rpc("ap_notify_everyone", { p_title: `${n} new research topics in My work`, p_body: "Starting one needs a mentor's approval.", p_link: "/my-work#ideas" });
  }
  return { state: "done", count: n };
}

// ── Opportunities: every morning, published only when checked ──────────

const SECTION_CATEGORY: Record<string, string> = {
  hackathon: "hackathon", competition: "competition", contest: "competition", quiz: "competition", ideathon: "ideathon", "innovation challenge": "innovation_challenge",
  internship: "internship", fellowship: "fellowship", scholarship: "scholarship", "tech fest": "tech_fest", fest: "tech_fest", workshop: "workshop", event: "tech_fest",
  research: "research", "research call": "research", "paper submission": "conference", conference: "conference",
};
const category = (type: string) => SECTION_CATEGORY[type.toLowerCase().trim()] ?? (/(hack)/i.test(type) ? "hackathon" : /(intern)/i.test(type) ? "internship" : /(fellow)/i.test(type) ? "fellowship" : /(scholar)/i.test(type) ? "scholarship" : /(fest)/i.test(type) ? "tech_fest" : /(confer|paper)/i.test(type) ? "conference" : /(research)/i.test(type) ? "research" : /(idea)/i.test(type) ? "ideathon" : "competition");
const region = (dist: number | null, country: string, near: number) => (/india/i.test(country) || !country ? (dist === null ? "india" : dist <= near ? "near" : dist <= 200 ? "ncr" : "india") : "international");

export async function dailyOpportunities(): Promise<Record<string, unknown>> {
  if (!ideaEngineConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const g = await gate(admin, "opportunities", "opportunities_publish");
  if (!g.ok) { await log(admin, "opportunities_publish", "Daily opportunities skipped", g.why); return { state: "skipped", why: g.why }; }
  const today = todayIST();
  const cap = g.s.numbers?.idea_daily_cap ?? 20;
  const threshold = g.s.numbers?.opp_value_threshold ?? 40;
  const near = g.s.numbers?.near_km ?? 100;
  if (g.s.numbers?.radar_grounding === 1) await log(admin, "idea_radar", "Grounding skipped", "Search grounding is not used: only free sources (it cannot see the key's billing)");
  const { data: sources } = await admin.from("opportunity_sources").select("*").eq("active", true);
  const texts: string[] = [];
  for (const s of sources ?? []) {
    const url = new URL(s.url as string);
    if (!(await robotsAllow(url))) { await admin.from("opportunity_sources").update({ last_fetched_at: new Date().toISOString(), last_result: "robots.txt disallows" }).eq("id", s.id); continue; }
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20_000), redirect: "follow" }).catch(() => null);
    const ok = res?.ok && (res.headers.get("content-type") ?? "").includes("html");
    await admin.from("opportunity_sources").update({ last_fetched_at: new Date().toISOString(), last_result: ok ? "fetched" : `failed ${res?.status ?? "network"}` }).eq("id", s.id);
    if (ok) texts.push(`SOURCE ${s.name} (${s.url}, region ${s.region}):\n${pageText(await res!.text())}`);
  }
  if (!texts.length) { await log(admin, "opportunities_publish", "No readable source this morning", "Nothing to read; trying tomorrow"); return { state: "no_sources" }; }
  const prompt = `From the page texts below, list student opportunities whose registration deadline is after ${today}: hackathons, competitions (coding, design, case, pitch, quiz), ideathons, tech fests and events, internships, fellowships and scholarships, research calls and conferences.
Use ONLY what the pages say; never guess a link, date, prize, fee or eligibility (use "" when not stated). "official_link" must be the event's own page as written in the text ([link ...]).
Reply with JSON: {"items":[{"title":"","organiser":"","type":"hackathon|competition|ideathon|tech fest|internship|fellowship|scholarship|research call|conference|workshop","mode":"online|offline|hybrid","city":"","country":"India or the country","deadline":"YYYY-MM-DD","dates":"","team":"solo|team|either|","eligibility":"","first_year_ok":"yes|no|","fees":"","free":"yes|no|","prizes":"","hubs":["design-branding|competitions-opportunities|projects-research-startups|event-crew"],"official_link":"","source_link":""}]}

${texts.join("\n\n").slice(0, 60_000)}`;
  const out = (await askJson(admin, "opportunities_publish", prompt, cap)) as { items?: Record<string, unknown>[] } | null;
  const run = crypto.randomUUID();
  let published = 0, skipped = 0;
  const reasons: Record<string, number> = {};
  const skip = (why: string) => { skipped++; reasons[why] = (reasons[why] ?? 0) + 1; };
  for (const it of out?.items ?? []) {
    const official = str(it.official_link, 500), deadline = str(it.deadline, 10), title = str(it.title, 160);
    const organiser = str(it.organiser, 120), mode = str(it.mode, 20).toLowerCase();
    if (!title || !organiser) { skip("no title or organiser"); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today) { skip("no future deadline"); continue; }
    if (!["online", "offline", "hybrid"].includes(mode)) { skip("no mode"); continue; }
    if (!(await linkLoads(official))) { skip("official link does not load"); continue; }
    const city = str(it.city, 60), dist = distanceKm(city);
    const hubs = list(it.hubs, 4).filter((h) => ["design-branding", "competitions-opportunities", "projects-research-startups", "event-crew"].includes(h));
    const score = valueScore({ distance_km: dist, mode, deadline, organiser, prizes: str(it.prizes), hubs, team_size: str(it.team) });
    if (score < threshold) { skip("value score below the threshold"); continue; }
    const cat = category(str(it.type, 60));
    const key = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${deadline}`;
    const { data: draft } = await admin.from("opportunity_drafts").upsert({
      title, organiser, kind: str(it.type, 60) || cat, mode, city: city || null, distance_km: dist, deadline, dates: str(it.dates, 120) || null, team_size: str(it.team, 40) || null,
      eligibility: str(it.eligibility, 300) || null, fees: str(it.fees, 80) || null, prizes: str(it.prizes, 200) || null, official_link: official, source_link: str(it.source_link, 500) || null,
      hubs: hubs.length ? hubs : ["competitions-opportunities"], value_score: score, dedupe_key: key, section: cat,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    if (!draft?.length) { skip("duplicate"); continue; }
    const fields = {
      category: cat, region: region(dist, str(it.country, 60), near),
      cost: /^yes$/i.test(str(it.free)) ? "free" : /^no$/i.test(str(it.free)) || str(it.fees) ? "paid" : "not_stated",
      team_mode: ["solo", "team", "either"].includes(str(it.team).toLowerCase()) ? str(it.team).toLowerCase() : "not_stated",
      eligibility_level: /^yes$/i.test(str(it.first_year_ok)) ? "first_year" : /(pg|post ?grad|master)/i.test(str(it.eligibility)) ? "pg" : str(it.eligibility) ? "any" : "not_stated",
      has_prize: Boolean(str(it.prizes)),
    };
    if (g.level === "auto") {
      const { data: id } = await admin.rpc("ap_publish_radar_item", { p_draft: draft[0].id, p_run: run, p: fields });
      if (id) published++; else skip("duplicate");
    } else {
      await admin.from("opportunity_drafts").update({ extra: fields }).eq("id", draft[0].id);
      await admin.from("autopilot_queue").insert({ area: "opportunities_publish", kind: "opportunity_draft", title: `Opportunity · auto: ${title} (${organiser})`,
        detail: `Deadline ${deadline} · value ${score} · link checked`, payload: { draft_id: draft[0].id }, dedupe: `opp:${draft[0].id}`, safe: false, hub: "competitions-opportunities" });
    }
  }
  await log(admin, "opportunities_publish", `Morning run: ${published} published, ${skipped} skipped`, Object.entries(reasons).map(([k, v]) => `${v} ${k}`).join("; ") || "nothing skipped");
  // One notification a day, only when something new is near Meerut or closes within 3 days.
  if (published) {
    const soon = new Date(new Date(`${today}T00:00:00Z`).getTime() + 3 * 864e5).toISOString().slice(0, 10);
    const { count } = await admin.from("opportunities").select("id", { count: "exact", head: true }).eq("run_id", run).or(`region.eq.near,deadline.lte.${soon}`);
    if (count) await admin.rpc("ap_notify_everyone", { p_title: `${count} new opportunit${count === 1 ? "y" : "ies"} near Meerut or closing soon`, p_body: "See them on the Opportunities page.", p_link: "/opportunities" });
    await admin.rpc("ap_ai_refresh");
  }
  return { state: "done", run, published, skipped, reasons };
}

// ── Tools Library: one new tool a day ───────────────────────────────────

const FREE = ["Free", "Free plan available", "Check pricing on the official site"];
const PRICE = /(₹|\$|€|£|\b\d+\s*(rs|inr|usd|per month|\/mo|a month)\b)/i;

export async function dailyTool(force = false): Promise<Record<string, unknown>> {
  if (!ideaEngineConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const g = await gate(admin, "tools", "tools_daily");
  if (!g.ok) { await log(admin, "tools_daily", "Daily tool skipped", g.why); return { state: "skipped", why: g.why }; }
  const today = todayIST();
  if (!force) {
    const { count } = await admin.from("tools").select("id", { count: "exact", head: true }).gte("updated_at", `${today}T00:00:00+05:30`).eq("auto", true);
    if (count) return { state: "done_today" };
  }
  const cap = g.s.numbers?.idea_daily_cap ?? 20;
  const [{ data: listed }, { data: blocked }] = await Promise.all([admin.from("tools").select("slug, name, updated_at, auto"), admin.from("tool_blocklist").select("slug")]);
  const have = new Set((listed ?? []).map((x) => x.slug as string));
  const no = new Set((blocked ?? []).map((x) => x.slug as string));
  let candidate = TOOL_CANDIDATES.find((c) => !have.has(c.slug) && !no.has(c.slug));
  let refresh = false;
  if (!candidate) {
    // The list is used up: refresh the oldest automatic page instead.
    const oldest = (listed ?? []).filter((x) => x.auto && !no.has(x.slug as string)).sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))[0];
    candidate = TOOL_CANDIDATES.find((c) => c.slug === oldest?.slug);
    refresh = true;
  }
  if (!candidate) return { state: "nothing_to_add" };
  if (!(await linkLoads(candidate.official)) || !(await linkLoads(candidate.docs))) {
    await log(admin, "tools_daily", `Skipped ${candidate.name}`, "An official link did not load");
    await admin.from("tool_blocklist").insert({ slug: candidate.slug }).then(() => null, () => null);
    return { state: "link_failed", slug: candidate.slug };
  }
  const write = `Write a short, accurate guide for students about the tool "${candidate.name}" (official site ${candidate.official}). Simple English. Only stable, well-known facts.
Never state prices or plan limits; for "free" choose exactly one of: "Free", "Free plan available", "Check pricing on the official site". Never invent features or steps.
Reply with JSON: {"what":"one line","why":"why it matters for students, one or two lines","uses":["3 items"],"steps":["5 simple get-started steps"],"tips":["3 tips"],"free":"","related":["names of related tools"]}`;
  const draft = (await askJson(admin, "tools_daily", write, cap)) as Record<string, unknown> | null;
  if (!draft) return { state: "no_ai" };
  // Second pass: remove wrong or uncertain claims.
  const review = `Check this guide about "${candidate.name}". Remove or rewrite anything wrong, uncertain, about prices or plan limits, or any invented feature or step. Keep the same JSON shape and keep it simple.
${JSON.stringify(draft)}`;
  const clean = ((await askJson(admin, "tools_daily", review, cap)) as Record<string, unknown> | null) ?? draft;
  const uses = list(clean.uses, 3), steps = list(clean.steps, 5), tips = list(clean.tips, 3);
  const what = str(clean.what, 200), why = str(clean.why, 400);
  const free = FREE.includes(str(clean.free)) ? str(clean.free) : "Check pricing on the official site";
  const text = [what, why, ...uses, ...steps, ...tips].join(" ");
  if (!what || !why || uses.length < 3 || steps.length < 5 || tips.length < 3 || PRICE.test(text)) {
    await log(admin, "tools_daily", `Not published: ${candidate.name}`, "Incomplete, or it mentioned prices");
    return { state: "rejected", slug: candidate.slug };
  }
  const related = list(clean.related, 4).map((r) => TOOL_CANDIDATES.find((c) => c.name.toLowerCase() === r.toLowerCase())?.slug ?? (listed ?? []).find((x) => String(x.name).toLowerCase() === r.toLowerCase())?.slug).filter(Boolean) as string[];
  const row = { slug: candidate.slug, name: candidate.name, category: candidate.category, what, why, uses, steps, tips, free_label: free, official_url: candidate.official, docs_url: candidate.docs, related, auto: true, updated_at: new Date().toISOString() };
  const { error } = refresh ? await admin.from("tools").update(row).eq("slug", candidate.slug) : await admin.from("tools").insert(row);
  if (error) { await log(admin, "tools_daily", `Not saved: ${candidate.name}`, error.message); return { state: "failed" }; }
  await log(admin, "tools_daily", `${refresh ? "Refreshed" : "Added"} ${candidate.name} to the Tools Library`, "Both official links load; reviewed twice");
  await admin.rpc("ap_ai_refresh");
  return { state: refresh ? "refreshed" : "added", slug: candidate.slug };
}

/** 00:05 IST: past-deadline opportunities close; things deleted 7+ days ago go for good. */
export async function nightlyCleanup(): Promise<Record<string, unknown>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const [{ data: closed }, { data: purged }] = await Promise.all([admin.rpc("ap_close_past_opportunities"), admin.rpc("ap_purge_deleted")]);
  return { closed, purged };
}

/** 7:30 IST: FusionX AI re-reads its public knowledge (unless its refresh is paused). */
export async function refreshAi(): Promise<Record<string, unknown>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured" };
  const admin = createAdminClient();
  const s = await settings(admin);
  if (s?.feature_pauses?.ai_refresh || s?.master !== "on") return { state: "paused" };
  await admin.rpc("ap_ai_refresh");
  await log(admin, "public_updates", "FusionX AI knowledge refreshed", "Morning refresh");
  return { state: "done" };
}

export { RESEARCH_FIELDS };
