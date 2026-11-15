import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/data/seo";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { createClient } from "@/lib/supabase/server";
import { CardGrid, FilterBar, OpportunityCard } from "@/components/opportunities/parts";
import { squadCounts, squadable } from "@/lib/opportunities/squads";
import { SECTIONS, applyFilters, daysLeft, isNewToday, sectionOf, todayIST, withParams, type Opp, type Params } from "@/lib/opportunities/sections";

export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata("opportunities", {
    title: "Opportunities",
    description: "Hackathons, competitions, internships, fellowships, tech fests and research calls for students, near Meerut and online. Updated every morning.",
  });

/**
 * Opportunities in sections (migration 0045): "New today" and "Closing in 3 days" strips, then each section's
 * six best, with "See all". An item stays until its deadline day ends; then it moves to Past (collapsed).
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const today = todayIST();
  const supabase = await createClient();
  const [{ data }, { data: past }] = await Promise.all([
    supabase.from("opportunities").select("*").eq("is_published", true).order("deadline", { ascending: true, nullsFirst: false }),
    supabase.rpc("ap_past_opportunities"),
  ]);
  const all = (data ?? []) as Opp[];
  const squads = await squadCounts(supabase, all.filter(squadable).map((o) => o.id));
  const list = applyFilters(all, p, today);
  const newToday = list.filter((o) => isNewToday(o, today)).slice(0, 8);
  const closing = list.filter((o) => { const d = daysLeft(o.deadline, today); return d !== null && d <= 3; }).slice(0, 8);
  const strip = (title: string, items: Opp[], key: string) => items.length > 0 && (
    <section aria-labelledby={key} className="mb-10" data-strip={key}>
      <h2 id={key} className="font-serif text-xl text-ink">{title} <span className="text-base text-ink/60">({items.length})</span></h2>
      <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map((o) => <li key={o.id} className="min-w-0"><OpportunityCard o={o} today={today} squad={squads[o.id]} /></li>)}</ul>
    </section>
  );

  return (
    <>
      <section className="border-b border-line">
        <div className="container-fx pb-10 pt-16 md:pb-12 md:pt-20">
          <Eyebrow>Opportunities</Eyebrow>
          <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">Hackathons, internships, and more.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70">
            Updated every morning; each one stays until its deadline. Always confirm the details on the organiser&rsquo;s official page before applying.
          </p>
        </div>
      </section>

      <Section className="py-8 md:py-10">
        <FilterBar p={p} action="/opportunities" count={list.length} />
        <div className="mt-8">
          {strip("New today", newToday, "new-today")}
          {strip("Closing in 3 days", closing, "closing")}
          {SECTIONS.filter((s) => !p.section || s.key === p.section).map((s) => {
            const items = list.filter((o) => sectionOf(o) === s.key);
            return (
              <section key={s.key} aria-labelledby={`sec-${s.key}`} className="mb-12" data-section={s.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`sec-${s.key}`} className="font-serif text-2xl text-ink">{s.label} <span className="text-base text-ink/60">({items.length})</span></h2>
                  {items.length > 6 && <Link href={withParams(`/opportunities/${s.key}`, { ...p, section: undefined }, {})} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text underline">See all {items.length}</Link>}
                </div>
                <div className="mt-4">{items.length ? <CardGrid items={items.slice(0, 6)} today={today} squads={squads} /> : <p className="border border-dashed border-line p-4 text-sm text-ink/70">{s.empty}</p>}</div>
              </section>
            );
          })}
          {((past ?? []) as { id: string; title: string; organizer: string; deadline: string }[]).length > 0 && (
            <details className="border border-line bg-surface" data-past>
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-ink">Past opportunities (last 60 days)</summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {((past ?? []) as { id: string; title: string; organizer: string; deadline: string }[]).map((o) => (
                  <li key={o.id} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:justify-between"><span className="break-words text-ink/80">{o.title} · {o.organizer}</span><span className="text-xs text-ink/60">closed {o.deadline}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Section>
    </>
  );
}
