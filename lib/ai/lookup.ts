import { createServerClient } from "@supabase/ssr";

/**
 * FusionX AI, on demand (migration 0045): for a question about opportunities, tools or projects, the matching
 * PUBLIC items are read right away (anon key, no session: exactly what a visitor can see) and added to that
 * answer's context. Closed (past-deadline), hidden and deleted items can't be read. At most 5 per kind.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
const visitor = () =>
  createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const plus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export const daysLeftText = (deadline: string | null, today = todayIST()) => {
  if (!deadline) return "rolling";
  const n = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  return n <= 0 ? "Closes today" : n === 1 ? "1 day left" : `${n} days left`;
};

const SECTION_WORDS: [RegExp, string][] = [
  [/hackathon/i, "hackathons"], [/(competition|contest|quiz|coding challenge)/i, "competitions"], [/(ideathon|innovation)/i, "ideathons"],
  [/(internship|intern\b)/i, "internships"], [/(fellowship|scholarship)/i, "fellowships"], [/(fest|workshop|event)/i, "fests"],
  [/(research|conference|paper)/i, "research"], [/(scriet|college)/i, "scriet"],
];

export type Opp = { title: string; organizer: string; section: string | null; mode: string | null; city: string | null; distance_km: number | null; deadline: string | null;
  eligibility: string | null; eligibility_level: string | null; cost: string | null; has_prize: boolean | null; registration_url: string | null; region: string | null; value_score: number | null; rolling: boolean | null };

export const oppLine = (o: Opp, today = todayIST()) =>
  `- ${o.title} by ${o.organizer}${o.section ? ` (${o.section})` : ""} · ${o.mode ?? "mode not stated"}${o.city ? ` · ${o.city}` : ""}` +
  ` · deadline ${o.deadline ?? "rolling"} (${daysLeftText(o.deadline, today)}) · ${o.cost === "free" ? "free" : o.cost === "paid" ? "paid" : "cost not stated"}` +
  `${o.eligibility_level === "first_year" ? " · 1st year friendly" : ""}${o.has_prize ? " · prize/stipend" : ""} · ${o.registration_url ?? `${SITE}/opportunities`}`;

/** The matching public items for this question, as a short block for the model (or "" when nothing matches). */
export async function lookupForQuestion(question: string): Promise<string> {
  const q = question.toLowerCase();
  const db = visitor();
  const today = todayIST();
  const blocks: string[] = [];
  const wantsOpp = SECTION_WORDS.some(([re]) => re.test(q)) || /(opportunit|deadline|closing|apply|prize|stipend|near meerut)/i.test(q);
  if (wantsOpp) {
    let query = db.from("opportunities").select("title, organizer, section, mode, city, distance_km, deadline, eligibility, eligibility_level, cost, has_prize, registration_url, region, value_score, rolling")
      .eq("is_published", true).or(`deadline.gte.${today},rolling.eq.true`);
    const section = SECTION_WORDS.find(([re]) => re.test(q))?.[1];
    if (section) query = query.eq("section", section);
    if (/(near|meerut|nearby)/i.test(q)) query = query.in("region", ["near", "ncr"]);
    if (/(this week|7 days|closing)/i.test(q)) query = query.lte("deadline", plus(today, 7));
    if (/(this month)/i.test(q)) query = query.lte("deadline", plus(today, 31));
    if (/\bfree\b/i.test(q)) query = query.eq("cost", "free");
    if (/(1st|first)[ -]?year/i.test(q)) query = query.in("eligibility_level", ["first_year"]);
    if (/(online)/i.test(q)) query = query.eq("mode", "online");
    const { data } = await query.order("deadline", { ascending: true, nullsFirst: false }).limit(5);
    const list = ((data ?? []) as Opp[]).filter((o) => !o.deadline || o.deadline >= today);
    blocks.push(list.length ? `Open opportunities matching the question (only these; never mention closed ones):\n${list.map((o) => oppLine(o, today)).join("\n")}\nAll: ${SITE}/opportunities${section ? `/${section}` : ""}`
      : `No open opportunity matches this question right now. All open ones: ${SITE}/opportunities`);
  }
  const wantsTool = /(tool|how do i (start|use)|what is|which (app|tool|software)|poster|design|code editor|github|git\b|markdown|figma|canva|notion|latex|overleaf)/i.test(q);
  if (wantsTool) {
    const words = q.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["what", "how", "the", "use", "start", "using", "which", "tool", "should", "make", "for", "and", "with"].includes(w));
    let { data } = words.length ? await db.from("tools").select("slug, name, category, what, steps, free_label").or(words.slice(0, 6).map((w) => `name.ilike.%${w}%`).join(",")).limit(5) : { data: [] };
    if (!data?.length && /(poster|design|graphic)/i.test(q)) ({ data } = await db.from("tools").select("slug, name, category, what, steps, free_label").eq("category", "design").limit(5));
    if (data?.length) blocks.push(`Tools Library pages matching the question:\n${(data as { slug: string; name: string; what: string; steps: string[]; free_label: string }[])
      .map((t) => `- ${t.name} (${t.free_label}): ${t.what} Steps: ${t.steps.join(" / ")} · ${SITE}/tools/${t.slug}`).join("\n")}`);
  }
  // How-to answers members ask often (the same facts as the knowledge pack's "How FusionX works for members").
  const help: string[] = [];
  if (/\bjoin\b/i.test(q) && /(project|team)/i.test(q))
    help.push(`- To join a project: open Projects (${SITE}/projects), sign in, then press "Join the team" on a project started from an idea, or "Join this project" on an open project.`);
  if (/(open seat|seats?\b)/i.test(q))
    help.push(`- Open seats on FusionX missions are listed for signed-in members at ${SITE}/autopilot/open-seats; apply there and the lead replies.`);
  if (help.length) blocks.push(`How to (FusionX help):\n${help.join("\n")}`);
  if (/(project|join|team|build)/i.test(q)) {
    const { data } = await db.from("projects").select("id, title, status").eq("is_published", true).order("updated_at", { ascending: false }).limit(5);
    if (data?.length) blocks.push(`Public projects (newest):\n${(data as { title: string; status: string }[]).map((p) => `- ${p.title} (${p.status}) · ${SITE}/projects`).join("\n")}`);
  }
  return blocks.join("\n\n");
}

/** Suggested questions from what is new (shown on the AI panel). */
export async function freshSuggestions(): Promise<string[]> {
  try {
    const db = visitor();
    const today = todayIST();
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ count: nearHack }, { count: closing }, { count: newTools }] = await Promise.all([
      db.from("opportunities").select("id", { count: "exact", head: true }).eq("is_published", true).eq("section", "hackathons").in("region", ["near", "ncr"]).gte("deadline", today),
      db.from("opportunities").select("id", { count: "exact", head: true }).eq("is_published", true).gte("deadline", today).lte("deadline", plus(today, 3)),
      db.from("tools").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    return [
      ...(nearHack ? [`${nearHack} hackathon${nearHack === 1 ? "" : "s"} you can join in person: which ones?`] : []),
      ...(closing ? ["Which opportunities close in 3 days?"] : []),
      ...(newTools ? ["Which tools were added this week?"] : []),
    ];
  } catch {
    return [];
  }
}
