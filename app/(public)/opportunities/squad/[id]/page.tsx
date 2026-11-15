import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { SquadBoard, type Board } from "@/components/squads/squad-board";
import { createClient } from "@/lib/supabase/server";
import { daysLeftLabel, todayIST } from "@/lib/opportunities/sections";
import { linkHref } from "@/lib/validation/link";

export const metadata: Metadata = { title: "Find a team · Opportunities", robots: { index: false } };

/** Squad Match (migration 0047): members find teammates for one opportunity, by role. Signed-in members only. */
export default async function SquadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/opportunities/squad/${id}`)}`);
  const [{ data: o }, { data: board }] = await Promise.all([
    supabase.from("opportunities").select("id, title, organizer, deadline, rolling, registration_url, team_mode, mode, city").eq("id", id).eq("is_published", true).maybeSingle(),
    supabase.rpc("ap_squad_board", { p_opp: id }),
  ]);
  if (!o) notFound();
  const today = todayIST();
  const href = linkHref(o.registration_url as string | null, "any", { allowPath: true });
  return (
    <Section className="max-w-5xl pb-24 pt-12">
      <Toaster />
      <Link href="/opportunities" className="inline-flex min-h-11 items-center text-sm underline">← All opportunities</Link>
      <Eyebrow>Find a team</Eyebrow>
      <h1 className="break-words font-serif text-3xl tracking-tight text-ink md:text-4xl" data-squad-title>{o.title as string}</h1>
      <p className="mt-2 text-sm text-ink/70">
        {o.organizer as string} · {daysLeftLabel(o.deadline as string | null, o.rolling as boolean | null, today)}
        {o.mode ? ` · ${String(o.mode)[0].toUpperCase()}${String(o.mode).slice(1)}` : ""}{o.city ? ` · ${o.city as string}` : ""}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/75">
        Build a squad here, then the lead registers the whole squad on the official site. Pick a role, see who needs it, and invite or ask in one tap.
      </p>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
          Official page <ArrowUpRight size={14} aria-hidden />
        </a>
      )}
      <div className="mt-8">
        {board ? <SquadBoard opp={id} board={board as Board} /> : (
          <p className="border border-dashed border-line p-4 text-sm text-ink/70">Squads are open to FusionX members while this opportunity is open. Complete your member profile to take part.</p>
        )}
      </div>
    </Section>
  );
}
