import { createServerClient } from "@supabase/ssr";
import { PERSON_CATEGORIES } from "@/lib/data/people";
import { hubs as shippedHubs, socialLinks } from "@/lib/site-config";
import { CONTENT, withFallback } from "@/lib/site-content/schema";
import { publicResultsHidden, resultsVisible, type PublicResults } from "@/lib/recruitment/results";
import { cycleState, type Cycle } from "@/lib/recruitment/shared";
import { linkHref } from "@/lib/validation/link";

/**
 * What FusionX AI knows: only what a signed-out visitor can already see.
 *
 * Everything is read with the ANON key and no session (so RLS treats the reader as a
 * visitor, whoever is signed in), from the same tables and public functions the public
 * pages use, and only the columns those pages show. Never the service role. Nothing from
 * applications, reviews, interviews, meetings, notifications, admin data, emails or
 * phones of people, or private group links can get in: the anon key can't read them.
 */

export type Section = { title: string; url: string; text: string };
export type Knowledge = { sections: Section[]; text: string; builtAt: string };

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
const OFFICIAL_EMAIL = socialLinks.email;
/** Kept well inside the free tier's tokens per request (about 4 characters a token). */
const BUDGET = 24_000;

function visitor() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
const at = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : "";

type Row = Record<string, unknown>;
const rows = async (query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> => {
  try {
    const { data, error } = await query;
    return error || !Array.isArray(data) ? [] : (data as Row[]);
  } catch {
    return [];
  }
};

/** Builds the pack now. Callers cache it (see getKnowledge in the route). */
export async function buildKnowledge(extraFacts: string): Promise<Knowledge> {
  const db = visitor();
  const now = Date.now();
  const [org, content, hubs, people, core, events, opportunities, resources, mentors, cycles] = await Promise.all([
    rows(db.from("organization_settings").select("chapter_name, subtitle, tagline, official_email, instagram_url, linkedin_url, whatsapp_url").eq("id", true)),
    rows(db.from("site_content").select("key, value").in("key", ["home.hero", "about.page", "lists.pipeline", "lists.journey", "lists.core_areas", "recruitment.page", "join.page", "teams.page"])),
    rows(db.from("programs").select("slug, name, tagline, summary, who_should_join, what_you_gain, type_label").eq("is_visible", true).order("display_order")),
    rows(db.from("org_people").select("full_name, role_title, category").eq("is_visible", true).order("display_order")),
    rows(db.rpc("get_core_teams")),
    rows(db.from("events").select("id, title, description, event_date, end_date, event_time, venue, organizer").eq("is_published", true).order("event_date")),
    rows(db.from("opportunities").select("title, organizer, category, deadline, status").eq("is_published", true).order("deadline", { ascending: true, nullsFirst: false })),
    rows(db.from("resources").select("title, category").eq("is_published", true).eq("visibility", "public").limit(30)),
    rows(db.from("mentors").select("name, role_title, expertise").eq("is_published", true)),
    rows(db.from("recruitment_cycles").select("*").neq("status", "draft").order("created_at", { ascending: false }).limit(5)),
  ]);

  const value = <T,>(key: keyof typeof CONTENT): T => {
    const stored = content.find((c) => c.key === key)?.value;
    return withFallback(CONTENT[key].fallback, stored) as T;
  };
  const o = (org[0] ?? {}) as { chapter_name?: string; subtitle?: string; tagline?: string; official_email?: string | null; instagram_url?: string | null; linkedin_url?: string | null; whatsapp_url?: string | null };
  const name = o.chapter_name || "FusionX@SCRIET";
  const sections: Section[] = [];
  const add = (title: string, path: string, lines: (string | false | null | undefined)[]) => {
    const text = lines.filter(Boolean).join("\n");
    if (text.trim()) sections.push({ title, url: `${SITE}${path}`, text });
  };

  // 1. What FusionX is
  const hero = value<{ description: string }>("home.hero");
  const about = value<{ mission: string; vision: string; why: string }>("about.page");
  const pipeline = value<string[]>("lists.pipeline");
  const areas = value<{ label: string }[]>("lists.core_areas");
  add(`About ${name}`, "/about", [
    `${name}: ${o.subtitle || "Student Innovation & Research Network"} at SCRIET (Sir Chhotu Ram Institute of Engineering and Technology), CCS University, Meerut.`,
    o.tagline && `Tagline: ${o.tagline}`,
    `What it does: ${clip(hero.description.replace("{name}", name), 400)}`,
    `Mission: ${clip(about.mission, 900)}`,
    `Vision: ${clip(about.vision, 700)}`,
    `Why it exists: ${clip(about.why, 1200)}`,
    pipeline.length > 0 && `How an idea grows here: ${pipeline.join(" → ")}`,
    areas.length > 0 && `Core areas: ${areas.map((a) => a.label).join(", ")}`,
  ]);

  // 2. Hubs
  const hubList = hubs.length ? hubs : shippedHubs.map((h) => ({ ...h }) as unknown as Row);
  add("FusionX Hubs", "/hubs", [
    `There are ${hubList.length} FusionX Hubs. Each has its own page.`,
    ...hubList.map((h) => `- ${h.name} (${SITE}/hubs/${h.slug}): ${clip((h.tagline as string) || (h.summary as string), 200)}${h.who_should_join ? ` Who should join: ${clip(h.who_should_join as string, 160)}` : ""}`),
  ]);

  // 3. How to join
  const join = value<{ intro: string }>("join.page");
  const recruitment = value<{ intro: string; difference: string }>("recruitment.page");
  const cycle = (cycles as unknown as Cycle[]).find((c) => cycleState(c, now) === "open") ?? (cycles as unknown as Cycle[])[0] ?? null;
  const state = cycleState(cycle, now);
  add("How to join", "/join", [
    `Become a member: apply on the Join page (${SITE}/join). ${clip(join.intro, 300)}`,
    `Recruitment (${SITE}/recruitment): ${clip(recruitment.difference, 300)}`,
    `Register your own project team: FusionX Teams (${SITE}/teams).`,
  ]);
  if (cycle) {
    const c = cycle as Cycle & { title?: string; opens_at?: string | null; closes_at?: string | null };
    add("Recruitment", "/recruitment", [
      `Current recruitment: ${c.title ?? "Recruitment"}.`,
      state === "open" && `Status: open now${c.closes_at ? `, applications close ${at(c.closes_at)}` : ""}. Apply at ${SITE}/recruitment.`,
      state === "upcoming" && `Status: opens ${at(c.opens_at)}.`,
      state === "closed" && "Status: applications are closed.",
      state === "results" && "Status: results are out.",
      clip(recruitment.intro, 400),
    ]);
    // The selected names only while the public results page itself shows them.
    if (resultsVisible(cycle, now) && !publicResultsHidden(cycle, now)) {
      const { data } = await db.rpc("get_public_results", { p_cycle: c.id });
      const r = data as PublicResults | null;
      if (r && r.state === "published" && r.show_selected) {
        add("Recruitment results", "/recruitment/results", [
          `${r.cycle_title} results (as listed on ${SITE}/recruitment/results):`,
          ...r.hubs.map((h) => `- ${h.name}: ${h.selected.join(", ") || "none listed"}`),
        ]);
      }
    }
  }

  // 4. Events (upcoming first, then a few recent)
  const today = new Date(now).toISOString().slice(0, 10);
  const upcoming = events.filter((e) => String(e.end_date ?? e.event_date) >= today);
  const past = events.filter((e) => String(e.end_date ?? e.event_date) < today).reverse().slice(0, 4);
  add("Events", "/events", [
    upcoming.length ? "Upcoming events:" : "There are no upcoming events listed right now.",
    ...upcoming.slice(0, 10).map((e) => `- ${e.title}: ${day(e.event_date as string)}${e.event_time ? `, ${String(e.event_time).slice(0, 5)}` : ""}${e.venue ? `, ${e.venue}` : ""} (${SITE}/events/${e.id}). ${clip(e.description as string, 180)}`),
    past.length > 0 && "Recent past events:",
    ...past.map((e) => `- ${e.title}: ${day(e.event_date as string)} (${SITE}/events/${e.id})`),
  ]);

  // 5. People shown publicly: founders, faculty, mentors, and the Core page
  for (const cat of PERSON_CATEGORIES) {
    const list = people.filter((p) => p.category === cat.value);
    if (list.length) add(cat.plural, "/about", list.map((p) => `- ${p.full_name}: ${clip(p.role_title as string, 120)}`));
  }
  const teams = new Map<string, string[]>();
  for (const m of core) {
    const team = String(m.group_name ?? "");
    teams.set(team, [...(teams.get(team) ?? []), `${m.full_name}${m.title ? ` (${m.title}${m.is_lead ? ", lead" : ""})` : ""}`]);
  }
  if (teams.size) add("Core page", "/core", [...teams].map(([team, names]) => `- ${team}: ${names.join(", ")}`));
  if (mentors.length) add("Mentors", "/mentors", mentors.map((m) => `- ${m.name}: ${clip(m.role_title as string, 100)}${Array.isArray(m.expertise) && m.expertise.length ? ` (${(m.expertise as string[]).slice(0, 4).join(", ")})` : ""}`));

  // 6. Opportunities and resources
  const open = opportunities.filter((op) => op.status !== "closed").slice(0, 10);
  if (open.length) add("Opportunities", "/opportunities", open.map((op) => `- ${op.title} by ${op.organizer}${op.deadline ? `, deadline ${day(op.deadline as string)}` : ""}`));
  if (resources.length) add("Resources", "/resources", [`Free resources by category: ${[...new Set(resources.map((r) => r.category as string))].join(", ")}.`, ...resources.slice(0, 12).map((r) => `- ${r.title}`)]);

  // 7. Contact and where to find FusionX
  add("Contact", "/contact", [
    `Email: ${o.official_email || OFFICIAL_EMAIL} (or the form on ${SITE}/contact).`,
    `Instagram: ${linkHref(o.instagram_url, "instagram") || socialLinks.instagram}`,
    `LinkedIn: ${linkHref(o.linkedin_url, "linkedin") || socialLinks.linkedin}`,
    `WhatsApp community (open to everyone): ${linkHref(o.whatsapp_url, "whatsapp_group") || socialLinks.whatsapp}`,
    `Privacy Policy: ${SITE}/privacy. Terms & Code of Conduct: ${SITE}/terms.`,
  ]);

  // 8. What the admins added for FAQs (public by design: the settings page says so)
  if (extraFacts.trim()) add("More facts", "/", [clip(extraFacts, 6000)]);

  // Most relevant first; trimmed to the budget.
  let text = "";
  const kept: Section[] = [];
  for (const s of sections) {
    const block = `## ${s.title} (${s.url})\n${s.text}\n\n`;
    if (text.length + block.length > BUDGET) break;
    text += block;
    kept.push(s);
  }
  return { sections: kept, text: text.trim(), builtAt: new Date(now).toISOString() };
}

let cached: { version: number; at: number; pack: Knowledge } | null = null;

/** The pack, rebuilt every 15 minutes and whenever an admin presses "Refresh knowledge". */
export async function getKnowledge(version: number, extraFacts: string): Promise<Knowledge> {
  if (cached && cached.version === version && Date.now() - cached.at < 15 * 60_000) return cached.pack;
  const pack = await buildKnowledge(extraFacts);
  cached = { version, at: Date.now(), pack };
  return pack;
}
