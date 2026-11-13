import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { createClient } from "@/lib/supabase/server";

type Card = { name: string; mission: string; slug: string; tasks: string[]; done_at: string };

async function load(code: string): Promise<Card | null> {
  if (!/^[a-z0-9]{10}$/.test(code)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_share_card", { p_code: code });
  return ((data ?? []) as Card[])[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const card = await load(code);
  if (!card) return { title: "FusionX" };
  const title = `I worked on ${card.mission} at FusionX`;
  return {
    title, description: card.tasks.join(" · "),
    openGraph: { title, description: card.tasks.join(" · "), images: [{ url: `/impact/card/${code}/image`, width: 1200, height: 627 }] },
    twitter: { card: "summary_large_image", title, images: [`/impact/card/${code}/image`] },
  };
}

/** The link a contributor shares: their verified tasks on a finished mission, pointing to its story. */
export default async function SharedCardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const card = await load(code);
  if (!card) notFound();
  return (
    <Section className="max-w-2xl pb-24 pt-14" >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/impact/card/${code}/image`} alt={`${card.name} worked on ${card.mission} at FusionX`} width={1200} height={627} className="w-full border border-line" />
      <h1 className="mt-6 font-serif text-3xl text-ink" data-card-title>I worked on {card.mission} at FusionX</h1>
      <p className="mt-2 text-ink/75">{card.name}&apos;s verified work:</p>
      <ul className="mt-2 list-inside list-disc text-ink/85">{card.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="mt-6"><Link href={`/impact/${card.slug}`} className="text-accent-text underline">Read the story of {card.mission}</Link></p>
    </Section>
  );
}
