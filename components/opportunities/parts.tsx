import Link from "next/link";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { FILTERS, FILTER_KEYS, SECTIONS, activeFilters, daysLeft, daysLeftLabel, isNewToday, sectionLabel, sectionOf, type Opp, type Params } from "@/lib/opportunities/sections";
import { linkHref } from "@/lib/validation/link";
import { cn } from "@/lib/utils";

/** One opportunity: equal height in its row, long names wrap, the link is a 44px target. */
export function OpportunityCard({ o, today }: { o: Opp; today: string }) {
  const d = daysLeft(o.deadline, today);
  const href = linkHref(o.registration_url, "any", { allowPath: true });
  const facts = [
    // A scholarship or fellowship is applied for, not attended: no Online/Offline.
    o.category === "scholarship" || o.category === "fellowship" ? "Apply online" : o.mode ? o.mode[0].toUpperCase() + o.mode.slice(1) : null,
    o.city ? `${o.city}${typeof o.distance_km === "number" && o.distance_km > 0 ? ` · ~${o.distance_km} km` : ""}` : null,
    o.cost === "free" ? "Free" : o.cost === "paid" ? "Paid" : null,
    o.team_mode === "solo" ? "Solo" : o.team_mode === "team" ? "Team" : o.team_mode === "either" ? "Solo or team" : null,
    o.eligibility_level === "first_year" ? "1st year friendly" : null,
    o.has_prize ? "Prize / stipend" : null,
  ].filter(Boolean);
  return (
    <article className="flex h-full min-w-0 flex-col justify-between border border-line bg-surface p-5" data-opp-card={sectionOf(o)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("border px-2 py-0.5 font-semibold", d !== null && d <= 3 ? "border-amber-600/60 bg-amber-500/10 text-ink" : "border-line text-ink/75")} data-days-left>
            {daysLeftLabel(o.deadline, o.rolling, today)}
          </span>
          {isNewToday(o, today) && <span className="border border-accent px-2 py-0.5 font-semibold text-accent-text">New today</span>}
        </div>
        <h3 className="mt-3 break-words font-serif text-lg leading-snug text-ink">{o.title}</h3>
        <p className="mt-1 break-words text-sm text-ink/70">{o.organizer}</p>
        {facts.length > 0 && <p className="mt-2 text-xs text-ink/65">{facts.join(" · ")}</p>}
        {o.deadline && <p className="mt-1 text-xs text-ink/60">Deadline {new Date(`${o.deadline}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</p>}
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-2">
          Official page <ArrowUpRight size={14} aria-hidden />
        </a>
      )}
    </article>
  );
}

export function CardGrid({ items, today }: { items: Opp[]; today: string }) {
  return (
    <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((o) => <li key={o.id} className="min-w-0"><OpportunityCard o={o} today={today} /></li>)}
    </ul>
  );
}

const selectClass = "min-h-11 w-full min-w-0 border border-line bg-paper px-3 text-sm text-ink focus-visible:outline-2";

function Fields({ p, withSection }: { p: Params; withSection: boolean }) {
  const sel = (name: keyof typeof FILTERS, label: string, all: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-ink/70">{label}
      <select name={name} defaultValue={p[name as keyof Params] ?? ""} className={selectClass}>
        {name !== "sort" && <option value="">{all}</option>}
        {FILTERS[name].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-ink/70 sm:col-span-2">Search
        <input type="search" name="q" defaultValue={p.q} placeholder="Title or organiser" className={selectClass} />
      </label>
      {withSection && (
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink/70">Section
          <select name="section" defaultValue={p.section ?? ""} className={selectClass}>
            <option value="">All sections</option>{SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      )}
      {sel("mode", "Mode", "Any mode")}
      {sel("where", "Location", "Anywhere")}
      {sel("deadline", "Deadline", "Any time")}
      {sel("cost", "Cost", "Any cost")}
      {sel("team", "Team", "Solo or team")}
      {sel("eligibility", "Eligibility", "Any")}
      {sel("hub", "Hub fit", "Any hub")}
      {sel("source", "Source", "Any source")}
      {sel("sort", "Sort", "")}
      <fieldset className="flex flex-wrap items-end gap-x-4 gap-y-1 text-sm text-ink/80">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="prize" value="1" defaultChecked={p.prize === "1"} className="h-5 w-5" /> Has prize / stipend</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="new" value="1" defaultChecked={p.new === "1"} className="h-5 w-5" /> New today</label>
      </fieldset>
    </div>
  );
}

/** One aligned bar on wider screens; a "Filters" sheet on phones. Plain GET forms: shareable URLs, no JavaScript needed. */
export function FilterBar({ p, action, count, withSection = true }: { p: Params; action: string; count: number; withSection?: boolean }) {
  const n = activeFilters(p);
  const buttons = (
    <div className="flex flex-wrap items-center gap-3">
      <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-white focus-visible:outline-2">Show results</button>
      {n > 0 && <Link href={action} className="inline-flex min-h-11 items-center px-2 text-sm underline">Clear all</Link>}
      <span className="text-sm text-ink/70" data-results-count>{count} result{count === 1 ? "" : "s"}</span>
    </div>
  );
  return (
    <div data-filter-bar>
      <details className="border border-line bg-surface md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-ink">
          <SlidersHorizontal size={16} aria-hidden /> Filters{n ? ` (${n})` : ""} <span className="ml-auto font-normal text-ink/65">{count} result{count === 1 ? "" : "s"}</span>
        </summary>
        <form action={action} className="space-y-4 border-t border-line p-4"><Fields p={p} withSection={withSection} />{buttons}</form>
      </details>
      <form action={action} className="hidden space-y-4 border border-line bg-surface p-4 md:block"><Fields p={p} withSection={withSection} />{buttons}</form>
    </div>
  );
}

export function keepParams(p: Params) {
  return Object.fromEntries(FILTER_KEYS.filter((k) => p[k]).map((k) => [k, p[k]!])) as Params;
}
export { sectionLabel };
