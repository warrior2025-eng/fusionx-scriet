"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/autopilot/center-parts";
import { respondSquad } from "@/actions/squads";

/** My work: squad invites to answer, and the squads I am in (migration 0047). */
export type MySquads = {
  invites: { squad_id: string; squad: string; role: string; lead: string; opportunity_id: string; opportunity: string; deadline: string | null }[];
  squads: { squad_id: string; squad: string; role: string; status: string; lead: boolean; opportunity_id: string; opportunity: string; deadline: string | null; requests: number }[];
};

/** " · registration closes 20 Nov" (the opportunity's deadline). */
const closes = (d: string | null) => (d ? ` · registration closes ${new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : "");

export function MySquadsBlock({ data, me }: { data: MySquads; me: string }) {
  const { pending, run } = useRun();
  return (
    <div className="space-y-3" data-my-squads>
      {data.invites.map((i) => (
        <div key={i.squad_id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-accent bg-accent/5 p-3">
          <span className="min-w-0 text-sm"><strong className="text-ink">{i.lead}</strong> invited you to <strong className="text-ink">{i.squad}</strong> as {i.role}
            <span className="block text-xs text-ink/65">{i.opportunity}{closes(i.deadline)}</span></span>
          <span className="flex gap-2">
            <Button className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(i.opportunity_id, i.squad_id, me, true))} data-accept-invite>Accept</Button>
            <Button variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => respondSquad(i.opportunity_id, i.squad_id, me, false))}>Decline</Button>
          </span>
        </div>
      ))}
      {data.squads.map((s) => (
        <Link key={s.squad_id} href={`/opportunities/squad/${s.opportunity_id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 border border-line bg-surface p-3 text-sm hover:border-accent">
          <span className="min-w-0"><strong className="text-ink">{s.squad}</strong> · {s.role}{s.lead ? " · lead" : ""}<span className="block text-xs text-ink/65">{s.opportunity}{closes(s.deadline)}</span></span>
          <span className="text-xs text-ink/70">{s.status === "registered" ? "Registered ✓" : s.status === "full" ? "Full" : "Forming"}{s.requests ? ` · ${s.requests} asking to join` : ""}</span>
        </Link>
      ))}
    </div>
  );
}
