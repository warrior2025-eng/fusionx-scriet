import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { createClient } from "@/lib/supabase/server";
import { CardGrid, FilterBar } from "@/components/opportunities/parts";
import { squadCounts, squadable } from "@/lib/opportunities/squads";
import { SECTIONS, applyFilters, todayIST, type Opp, type Params } from "@/lib/opportunities/sections";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const s = SECTIONS.find((x) => x.key === section);
  return { title: s ? `${s.label} · Opportunities` : "Opportunities" };
}

/** Every open item in one section, with the same filters (kept in the URL). */
export default async function SectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Params> }) {
  const { section } = await params;
  const s = SECTIONS.find((x) => x.key === section);
  if (!s) notFound();
  const p = { ...(await searchParams), section };
  const today = todayIST();
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("*").eq("is_published", true);
  const list = applyFilters((data ?? []) as Opp[], p, today);
  const squads = await squadCounts(supabase, list.filter(squadable).map((o) => o.id));
  return (
    <Section className="pb-24 pt-12">
      <Link href="/opportunities" className="inline-flex min-h-11 items-center text-sm underline">← All opportunities</Link>
      <Eyebrow>Opportunities</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl" data-section-title>{s.label}</h1>
      <div className="mt-6"><FilterBar p={p} action={`/opportunities/${section}`} count={list.length} withSection={false} /></div>
      <div className="mt-8">{list.length ? <CardGrid items={list} today={today} squads={squads} /> : <p className="border border-dashed border-line p-4 text-sm text-ink/70">{s.empty}</p>}</div>
    </Section>
  );
}
