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
    : type === "hackathon" || type === "ideathon" ? ["projects-research-startups", "competitions-opportunities"]
      : type === "workshop" || type === "conference" ? ["projects-research-startups"]
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

// Unstop list → our type (and so the Opportunities section). Competitions that are idea, pitch, business-plan or
// innovation contests are shown as ideathons.
const UNSTOP_TYPES: [string, string, number][] = [
  ["hackathons", "hackathon", 30], ["competitions", "competition", 50], ["quizzes", "competition", 20], ["internships", "internship", 30],
  ["scholarships", "scholarship", 20], ["workshops", "workshop", 30], ["conferences", "conference", 20],
];
const IDEATHON = /\b(ideathon|idea(s)? (challenge|competition|contest)|innovation challenge|business plan|b-?plan|pitch|case (study|competition)|startup challenge)\b/i;
const RESEARCH = /\b(research|paper|poster|symposium|journal|conference|colloquium|thesis)\b/i;
async function unstop(): Promise<FeedItem[]> {
  const pages = await Promise.all(UNSTOP_TYPES.map(async ([kind, type, n]) => {
    const j = (await getJson(`https://unstop.com/api/public/opportunity/search-result?opportunity=${kind}&per_page=${n}&oppstatus=open`)) as { data?: { data?: Record<string, unknown>[] } } | null;
    return (j?.data?.data ?? []).map((o) => ({
      o, kind,
      type: type === "competition" && (o.subtype === "innovation_challenge" || o.subtype === "case_competition" || IDEATHON.test(s(o.title, 200))) ? "ideathon"
        // Unstop's "conferences" also hold debates, talks and schools: only research-like ones go to Research.
        : type === "conference" && !RESEARCH.test(s(o.title, 200)) ? "tech fest" : type,
    }));
  }));
  return pages.flat().filter(({ o }) => o.regn_open === 1 || o.regn_open === true).map(({ o, type, kind }) => {
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
      hubs: hubsFor(type), official_link: s(o.seo_url, 500), source_link: `https://unstop.com/${kind}`, source: "Unstop",
    };
  });
}

/** College fests on Unstop: shown until the fest's last day, while its registration is not closed. */
async function unstopFests(): Promise<FeedItem[]> {
  const j = (await getJson("https://unstop.com/api/public/opportunity/search-result?opportunity=festivals&per_page=30&oppstatus=open")) as { data?: { data?: Record<string, unknown>[] } } | null;
  return (j?.data?.data ?? []).filter((f) => f.regn_open !== 0 && f.visibility !== "private").map((f) => {
    const where = s(f.location, 120);
    const mode = /^online$/i.test(where) ? "online" : /^hybrid$/i.test(where) ? "hybrid" : where ? "offline" : "";
    const city = mode === "offline" ? (where.split(",").map((x) => x.trim()).filter(Boolean).find((x) => /^[A-Za-z .]+$/.test(x) && x.length < 30 && !/institute|university|college|school/i.test(x)) ?? "") : "";
    return {
      title: s(f.name, 160), organiser: s(f.organisation_name, 120), type: "tech fest", mode, city, country: "India",
      deadline: istDate(typeof f.end_date === "string" ? f.end_date.replace(" ", "T") + "+05:30" : ""), team: "", eligibility: "", first_year_ok: "", free: "", prizes: "",
      hubs: ["event-crew", "competitions-opportunities"], official_link: s(f.seo_url, 500), source_link: "https://unstop.com/festivals", source: "Unstop",
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

/**
 * Scholarships and fellowships from Opportunity Desk's public RSS feed (its robots.txt allows it). Kept only when
 * the post states a deadline, is open to students from Asia or India (or names no region), is not PhD-only, and its
 * article links to the organiser's own page: that page is the link shown, never the article.
 */
const OD_GENERIC = /^(africa|america|asia|australia and oceania|europe|india|scholarships|fellowships|undergraduate|masters\/postgraduate|phd\/postdoctoral|postdoctoral|grants|awards|training|short courses|online courses|study abroad|conferences|competitions|internships|uncategorized|our blog)$/i;
const SOCIAL = /opportunitydesk|facebook|twitter|linkedin|whatsapp|telegram|instagram|pinterest|youtube|google|wp\.com|gravatar|\bx\.com|t\.me|reddit|feedburner|wordpress/i;
const INDIA_OK = /\bindia(n|ns)?\b|\b(all|any|every)\s+(countries|country|nationalit(y|ies))\b|\bregardless of (nationality|country)\b|\bopen to (applicants|students|candidates) from (all|any|every|around the world)\b|\bno nationality restrictions?\b/i;
const INDIA_EXCLUDED = /\b(not|except|excluding|excluded|ineligible)\b[^.]{0,60}\bindia(n|ns)?\b/i;
async function opportunityDesk(): Promise<FeedItem[]> {
  const pages = await Promise.all([1, 2, 3].map(async (n) => {
    const res = await fetch(`https://opportunitydesk.org/category/fellowships-and-scholarships/feed/?paged=${n}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
    return res?.ok ? res.text() : "";
  }));
  const posts = pages.join("").split("<item>").slice(1).map((it) => {
    const tag = (t: string) => (new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`).exec(it) ?? [])[1] ?? "";
    const cats = [...it.matchAll(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)].map((m) => m[1].trim());
    const title = tag("title").replace(/&#8211;/g, "–").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").trim();
    const m = /Deadline:\s*([A-Za-z]+ \d{1,2}, \d{4})/i.exec(it);
    const t = m ? Date.parse(`${m[1]} 12:00 UTC`) : NaN;
    return { title, link: tag("link").trim(), cats, deadline: Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10) };
  });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const fit = posts.filter((p) => {
    const has = (re: RegExp) => p.cats.some((c) => re.test(c));
    if (!p.title || !p.deadline || p.deadline < today || has(/^our blog$/i)) return false;
    const regions = p.cats.filter((c) => /^(africa|america|asia|australia and oceania|europe)$/i.test(c));
    if (regions.length && !has(/^(asia|india)$/i)) return false; // not open to students from India
    if (has(/^phd\/postdoctoral$/i) && !has(/^(undergraduate|masters\/postgraduate)$/i)) return false; // PhD only
    return true;
  }).slice(0, 12);
  const out = await Promise.all(fit.map(async (p): Promise<FeedItem | null> => {
    const res = await fetch(p.link, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
    const html = res?.ok ? await res.text() : "";
    const body = html.slice(html.indexOf("<article"), html.indexOf("</article>") > 0 ? html.indexOf("</article>") : undefined);
    // Indian students must be eligible: the post names India, or says every country or nationality may apply.
    const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
    if (!INDIA_OK.test(text) || INDIA_EXCLUDED.test(text)) return null;
    const links = [...body.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g)].map((m) => ({ url: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() })).filter((l) => !SOCIAL.test(l.url));
    const words = p.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const official = links.find((l) => /official|website|webpage/i.test(l.text)) ?? links.find((l) => words.some((w) => l.text.toLowerCase().includes(w))) ?? links.find((l) => /apply|click here/i.test(l.text));
    if (!official) return null;
    const named = (c: string) => !OD_GENERIC.test(c) && p.title.toLowerCase().includes(c.toLowerCase()) && c.length < 80 && !/\d{4}/.test(c);
    // The organisation's own name first (e.g. "Swedish Institute"), else the programme's name.
    const organiser = p.cats.find((c) => named(c) && !/scholarship|fellowship|programme|program|award/i.test(c)) ?? p.cats.find(named)
      ?? (/^(.*?)\s+(scholarship|fellowship|programme|program|award)/i.exec(p.title)?.[1] ?? "");
    const fellowship = /fellowship/i.test(p.title) || (p.cats.some((c) => /^fellowships$/i.test(c)) && !/scholarship/i.test(p.title));
    return {
      title: s(p.title, 160), organiser: s(organiser, 120), type: fellowship ? "fellowship" : "scholarship", mode: "online", city: "", country: "",
      deadline: p.deadline, team: "solo", eligibility: p.cats.filter((c) => /^(undergraduate|masters\/postgraduate)$/i.test(c)).join(", "), first_year_ok: "",
      free: "yes", prizes: "", hubs: ["projects-research-startups"], official_link: official.url, source_link: p.link, source: "Opportunity Desk",
    };
  }));
  return out.filter((x): x is FeedItem => x !== null);
}

/** Every open item from the feeds (a feed that fails adds nothing). */
export async function readFeeds(): Promise<{ items: FeedItem[]; counts: Record<string, number> }> {
  // Local tests set OPPORTUNITY_FEEDS=off so no real website is called.
  if (process.env.OPPORTUNITY_FEEDS === "off") return { items: [], counts: {} };
  const [a, b, c, d, e] = await Promise.all([devpost().catch(() => []), unstop().catch(() => []), devfolio().catch(() => []), unstopFests().catch(() => []), opportunityDesk().catch(() => [])]);
  return { items: [...a, ...b, ...c, ...d, ...e].filter((i) => i.title && i.official_link), counts: { Devpost: a.length, Unstop: b.length + d.length, Devfolio: c.length, "Opportunity Desk": e.length } };
}

/** Hosts the feeds already cover: their HTML pages need JavaScript, so they are not read as page text. */
export const FEED_HOSTS = ["devpost.com", "unstop.com", "devfolio.co"];
