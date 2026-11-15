/**
 * Opportunity feeds (SERVER ONLY): the free public JSON lists of Devpost, Unstop and Devfolio, read with no key.
 * Each item comes straight from the platform (title, organiser, registration deadline, mode, city, prizes, team
 * size, link): nothing is guessed or written by AI. The morning job then applies its usual checks (future
 * deadline, known mode, the link loads, value score) before anything is published.
 * Their robots.txt files allow these paths (checked 15 Nov 2026).
 */

export type FeedItem = {
  title: string; organiser: string; type: string; mode: string; city: string; country: string; deadline: string;
  team: string; eligibility: string; first_year_ok: string; free: string; prizes: string; hubs: string[];
  official_link: string; source_link: string; source: string;
};

const UA = "Mozilla/5.0 (compatible; FusionX-Radar/1.0; +https://fxscriet.com)";
const getJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
};
const s = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const istDate = (iso: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
};
const hubsFor = (type: string) =>
  type === "internship" || type === "scholarship" ? ["projects-research-startups"]
    : type === "hackathon" ? ["projects-research-startups", "competitions-opportunities"]
      : ["competitions-opportunities"];
const teamOf = (min: unknown, max: unknown) => {
  const lo = Number(min) || 0, hi = Number(max) || 0;
  return hi === 1 ? "solo" : lo > 1 ? "team" : hi > 1 ? "either" : "";
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Devpost's "Oct 30 - Dec 04, 2026" or "Nov 15 - 20, 2026": the last day of the submission period. */
export function devpostDeadline(period: string): string {
  const m = /([A-Za-z]{3})\s+\d{1,2}(?:,\s*\d{4})?\s*-\s*(?:([A-Za-z]{3})\s+)?(\d{1,2}),\s*(\d{4})/.exec(period ?? "");
  if (!m) return "";
  const month = MONTHS.indexOf((m[2] ?? m[1]).toLowerCase());
  if (month < 0) return "";
  return `${m[4]}-${String(month + 1).padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

async function devpost(): Promise<FeedItem[]> {
  const j = (await getJson("https://devpost.com/api/hackathons?status[]=upcoming&status[]=open")) as { hackathons?: Record<string, unknown>[] } | null;
  return (j?.hackathons ?? []).filter((h) => !h.invite_only && h.open_state !== "ended").map((h) => {
    const where = s((h.displayed_location as { location?: string } | undefined)?.location, 80);
    const online = /online/i.test(where);
    return {
      title: s(h.title, 160), organiser: s(h.organization_name, 120) || "Devpost", type: "hackathon", mode: online ? "online" : where ? "offline" : "",
      city: online ? "" : where.split(",")[0] ?? "", country: online ? "" : where.split(",").pop()?.trim() ?? "", deadline: devpostDeadline(s(h.submission_period_dates, 60)),
      team: "", eligibility: "", first_year_ok: "", free: "", prizes: s(h.prize_amount, 60).replace(/^\$?0$/, ""), hubs: hubsFor("hackathon"),
      official_link: s(h.url, 500), source_link: "https://devpost.com/hackathons", source: "Devpost",
    };
  });
}

const UNSTOP_TYPES: [string, string][] = [["hackathons", "hackathon"], ["competitions", "competition"], ["internships", "internship"], ["scholarships", "scholarship"]];
async function unstop(): Promise<FeedItem[]> {
  const pages = await Promise.all(UNSTOP_TYPES.map(async ([kind, type]) => {
    const j = (await getJson(`https://unstop.com/api/public/opportunity/search-result?opportunity=${kind}&per_page=30&oppstatus=open`)) as { data?: { data?: Record<string, unknown>[] } } | null;
    return (j?.data?.data ?? []).map((o) => ({ o, type }));
  }));
  return pages.flat().filter(({ o }) => o.regn_open === 1 || o.regn_open === true).map(({ o, type }) => {
    const reg = (o.regnRequirements ?? {}) as Record<string, unknown>;
    const addr = (o.address_with_country_logo ?? {}) as { city?: string; country?: { name?: string } };
    const prizes = Array.isArray(o.prizes) ? (o.prizes as { cash?: number; currency?: string }[]) : [];
    const cash = prizes.reduce((n, p) => n + (Number(p.cash) || 0), 0);
    const rupee = prizes.some((p) => /rupee|inr/i.test(p.currency ?? ""));
    const eligible = Array.isArray(o.filters) ? (o.filters as { type?: string; name?: string }[]).filter((f) => f.type === "eligible").map((f) => s(f.name, 60)).filter(Boolean) : [];
    const region = s(o.region, 20).toLowerCase();
    return {
      title: s(o.title, 160), organiser: s((o.organisation as { name?: string } | undefined)?.name, 120), type,
      mode: ["online", "offline", "hybrid"].includes(region) ? region : "", city: s(addr.city, 60), country: s(addr.country?.name, 60),
      deadline: istDate(reg.end_regn_dt ?? o.end_date), team: teamOf(reg.min_team_size, reg.max_team_size), eligibility: eligible.join(", ").slice(0, 300),
      first_year_ok: eligible.some((e) => /first year|1st year|all years|everyone/i.test(e)) ? "yes" : "",
      free: o.isPaid === false ? "yes" : o.isPaid === true ? "no" : "", prizes: cash > 0 ? `${rupee ? "₹" : ""}${cash.toLocaleString("en-IN")}${rupee ? "" : " (cash)"}` : "",
      hubs: hubsFor(type), official_link: s(o.seo_url, 500), source_link: `https://unstop.com/${UNSTOP_TYPES.find(([, t]) => t === type)?.[0] ?? ""}`, source: "Unstop",
    };
  });
}

async function devfolio(): Promise<FeedItem[]> {
  const j = (await getJson("https://api.devfolio.co/api/hackathons?filter=application_open&page=1&limit=30")) as { result?: Record<string, unknown>[] } | null;
  return (j?.result ?? []).filter((h) => !h.private).map((h) => {
    const set = (h.hackathon_setting ?? {}) as Record<string, unknown>;
    const sub = s(set.subdomain, 80) || s(h.slug, 80);
    return {
      title: s(h.name, 160), organiser: "Listed on Devfolio", type: "hackathon", mode: h.is_online ? "online" : set.is_hybrid ? "hybrid" : "offline",
      city: s(h.city, 60), country: s(h.country, 60), deadline: istDate(set.reg_ends_at), team: teamOf(h.team_min, h.team_size), eligibility: "",
      first_year_ok: "", free: set.paid === false ? "yes" : set.paid === true ? "no" : "", prizes: "", hubs: hubsFor("hackathon"),
      official_link: sub ? `https://${sub}.devfolio.co/` : "", source_link: "https://devfolio.co/hackathons", source: "Devfolio",
    };
  });
}

/** Every open item from the three feeds (a feed that fails adds nothing). */
export async function readFeeds(): Promise<{ items: FeedItem[]; counts: Record<string, number> }> {
  const [a, b, c] = await Promise.all([devpost().catch(() => []), unstop().catch(() => []), devfolio().catch(() => [])]);
  return { items: [...a, ...b, ...c].filter((i) => i.title && i.official_link), counts: { Devpost: a.length, Unstop: b.length, Devfolio: c.length } };
}

/** Hosts the feeds already cover: their HTML pages need JavaScript, so they are not read as page text. */
export const FEED_HOSTS = ["devpost.com", "unstop.com", "devfolio.co"];
