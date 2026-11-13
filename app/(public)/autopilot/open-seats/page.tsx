import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Toaster } from "@/components/admin/toast";
import { ApplyForSeat } from "@/components/autopilot/people-parts";
import { dayLabel } from "@/lib/autopilot/server";
import { EFFORT_LABEL, hubLabel } from "@/lib/autopilot/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Open seats" };

/** Seats on FusionX missions anyone signed in can apply for (website members get a head start). */
export default async function OpenSeatsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/autopilot/open-seats");
  const { data } = await supabase.rpc("ap_visible_seats");
  type Seat = { id: string; task_title: string; mission_title: string; mission_date: string; due_on: string; skill: string | null; effort: string; note: string | null; hub: string; members_first: boolean; applied: boolean };
  const seats = (data ?? []) as Seat[];
  return (
    <Section className="max-w-3xl pb-24 pt-12">
      <Toaster />
      <Eyebrow>Open seats</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Join a FusionX mission.</h1>
      <p className="mt-2 text-sm text-ink/65">One task, real work, reviewed by the team. Approved work counts as a verified contribution on your record.</p>
      {seats.length === 0 ? (
        <p className="mt-8 border border-dashed border-line p-4 text-sm text-ink/70" data-no-seats>No open seats right now. New ones appear here; members of the site see them first.</p>
      ) : (
        <ul className="mt-8 space-y-3" data-seats>
          {seats.map((s) => (
            <li key={s.id} className="border border-line bg-surface p-4" data-seat={s.id}>
              <p className="font-medium text-ink">{s.task_title}</p>
              <p className="text-xs text-ink/60">{s.mission_title} · {hubLabel(s.hub)} · {EFFORT_LABEL[s.effort]} · due {dayLabel(s.due_on)}{s.skill ? ` · ${s.skill}` : ""}{s.members_first ? " · members' head start" : ""}</p>
              {s.note && <p className="mt-1 text-sm text-ink/80">{s.note}</p>}
              <div className="mt-2">{s.applied ? <p className="text-sm text-ink/70">You applied. The mission owner will decide.</p> : <ApplyForSeat seatId={s.id} />}</div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
