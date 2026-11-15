/**
 * Opportunities in sections (migration 0045), with filters kept in the URL. Pure: safe in the browser too.
 */

export const SECTIONS = [
  { key: "hackathons", label: "Hackathons", empty: "No hackathons right now. Check back tomorrow." },
  { key: "competitions", label: "Competitions", empty: "No competitions right now. Check back tomorrow." },
  { key: "ideathons", label: "Ideathons & Innovation challenges", empty: "No ideathons right now. Check back tomorrow." },
  { key: "internships", label: "Internships", empty: "No internships right now. Check back tomorrow." },
  { key: "fellowships", label: "Fellowships & Scholarships", empty: "No fellowships or scholarships right now. Check back tomorrow." },
  { key: "fests", label: "Tech fests & Events", empty: "No tech fests or events right now. Check back tomorrow." },
  { key: "research", label: "Research & Conferences", empty: "No research calls or conferences right now. Check back tomorrow." },
  { key: "scriet", label: "At SCRIET", empty: "Nothing at SCRIET right now." },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export const sectionLabel = (k: string) => SECTIONS.find((s) => s.key === k)?.label ?? "Opportunities";

/** Older rows without a section (before the migration): from the category, as the database does. */
export function sectionOf(o: { section?: string | null; category?: string | null; source?: string | null }): string {
  if (o.section) return o.section;
  if (o.source === "scriet") return "scriet";
  const c = o.category ?? "";
  return c === "hackathon" ? "hackathons" : c === "competition" ? "competitions" : ["innovation_challenge", "ideathon"].includes(c) ? "ideathons" : c === "internship" ? "internships"
    : ["scholarship", "fellowship"].includes(c) ? "fellowships" : ["workshop", "tech_fest"].includes(c) ? "fests" : ["research", "conference"].includes(c) ? "research" : "competitions";
}

export type Opp = {
  id: string; title: string; organizer: string; category: string; description: string | null; eligibility: string | null; deadline: string | null; registration_url: string | null;
  section?: string | null; mode?: string | null; city?: string | null; distance_km?: number | null; region?: string | null; cost?: string | null; team_mode?: string | null;
  eligibility_level?: string | null; has_prize?: boolean | null; hubs?: string[] | null; source?: string | null; value_score?: number | null; first_published_at?: string | null;
  rolling?: boolean | null; created_at?: string | null;
};

export const FILTERS = {
  mode: [["online", "Online"], ["offline", "Offline"], ["hybrid", "Hybrid"]],
  where: [["near", "Near Meerut (≤ 100 km)"], ["ncr", "Delhi NCR"], ["india", "Anywhere in India"], ["international", "International"]],
  deadline: [["3", "Closing in 3 days"], ["week", "This week"], ["month", "This month"], ["later", "Later"]],
  cost: [["free", "Free"], ["paid", "Paid"], ["not_stated", "Not stated"]],
  team: [["solo", "Solo"], ["team", "Team"]],
  eligibility: [["first_year", "1st year friendly"], ["any", "Any year"], ["pg", "PG or other"]],
  hub: [["design-branding", "Design"], ["competitions-opportunities", "Competitions"], ["projects-research-startups", "Projects / Research / Startups"], ["event-crew", "Event Crew"]],
  source: [["auto", "Found automatically"], ["scriet", "At SCRIET"]],
  sort: [["best", "Best match"], ["deadline", "Deadline soonest"], ["newest", "Newest"], ["nearest", "Nearest"]],
} as const;
export type Params = Partial<Record<"q" | "section" | "mode" | "where" | "deadline" | "cost" | "team" | "eligibility" | "prize" | "hub" | "new" | "source" | "sort", string>>;
export const FILTER_KEYS = ["q", "section", "mode", "where", "deadline", "cost", "team", "eligibility", "prize", "hub", "new", "source", "sort"] as const;

export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
export function daysLeft(deadline: string | null | undefined, today = todayIST()): number | null {
  if (!deadline) return null;
  return Math.round((new Date(`${deadline}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 864e5);
}
export function daysLeftLabel(deadline: string | null | undefined, rolling?: boolean | null, today = todayIST()): string {
  const d = daysLeft(deadline, today);
  if (d === null) return rolling ? "Rolling" : "No deadline stated";
  return d === 0 ? "Closes today" : d === 1 ? "1 day left" : `${d} days left`;
}
export const isNewToday = (o: Opp, today = todayIST()) => !!o.first_published_at && new Date(o.first_published_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === today;

/** Only what is still open: no past deadline (end of that day, IST). */
export const stillOpen = (o: Opp, today = todayIST()) => !o.deadline || o.deadline >= today;

export function applyFilters(list: Opp[], p: Params, today = todayIST()): Opp[] {
  const q = (p.q ?? "").trim().toLowerCase();
  const out = list.filter((o) => {
    if (!stillOpen(o, today)) return false;
    if (q && !`${o.title} ${o.organizer}`.toLowerCase().includes(q)) return false;
    if (p.section && sectionOf(o) !== p.section) return false;
    if (p.mode && (o.mode ?? "").toLowerCase() !== p.mode) return false;
    if (p.where) {
      const r = o.region ?? (o.distance_km !== null && o.distance_km !== undefined ? (o.distance_km <= 100 ? "near" : o.distance_km <= 200 ? "ncr" : "india") : null);
      if (p.where === "ncr" ? !(r === "ncr" || r === "near") : r !== p.where) return false;
    }
    if (p.deadline && o.deadline) {
      const d = o.deadline;
      if (p.deadline === "3" && d > addDays(today, 3)) return false;
      if (p.deadline === "week" && d > addDays(today, 7)) return false;
      if (p.deadline === "month" && d > addDays(today, 31)) return false;
      if (p.deadline === "later" && d <= addDays(today, 31)) return false;
    } else if (p.deadline) return false;
    if (p.cost && (o.cost ?? "not_stated") !== p.cost) return false;
    if (p.team && !((o.team_mode ?? "") === p.team || o.team_mode === "either")) return false;
    if (p.eligibility && (o.eligibility_level ?? "not_stated") !== p.eligibility) return false;
    if (p.prize === "1" && !o.has_prize) return false;
    if (p.hub && !(o.hubs ?? []).includes(p.hub)) return false;
    if (p.new === "1" && !isNewToday(o, today)) return false;
    if (p.source && (o.source ?? "manual") !== p.source) return false;
    return true;
  });
  const sort = p.sort ?? "best";
  return out.sort((a, b) =>
    sort === "deadline" ? (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
    : sort === "newest" ? (b.first_published_at ?? b.created_at ?? "").localeCompare(a.first_published_at ?? a.created_at ?? "")
    : sort === "nearest" ? (a.distance_km ?? 99999) - (b.distance_km ?? 99999)
    : (b.value_score ?? 0) - (a.value_score ?? 0) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

export function withParams(base: string, p: Params, patch: Params): string {
  const merged = { ...p, ...patch };
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
  return qs.size ? `${base}?${qs}` : base;
}
export const activeFilters = (p: Params) => FILTER_KEYS.filter((k) => k !== "sort" && p[k]).length;
