"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, DoorOpen, FileText, Radio, XCircle } from "lucide-react";
import { useServerClock } from "@/components/interview/use-server-clock";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { istDateTime } from "@/lib/events/format";
import { passPhase, untilText, type MeetingPhase, type Pass, type PassOwner } from "@/lib/meetings/shared";
import { cn } from "@/lib/utils";

function Strip({ pass, phase, now, onEnter }: { pass: Pass; phase: MeetingPhase; now: number; onEnter?: () => void }) {
  const base = "flex w-full items-center gap-2 border-t border-dashed border-line px-5 py-3.5 text-sm font-semibold sm:px-6";
  const enter = `/meetings/${pass.id}?enter=1`;
  const open = (children: React.ReactNode, tone: string) =>
    onEnter ? (
      <button type="button" onClick={onEnter} className={cn(base, tone, "text-left")}>
        {children}
      </button>
    ) : (
      <Link href={enter} className={cn(base, tone)}>
        {children}
      </Link>
    );
  if (phase === "upcoming") {
    return (
      <p className={cn(base, "text-ink/80")}>
        <CalendarClock size={16} aria-hidden /> Doors open in {untilText(new Date(pass.starts_at).getTime() - 10 * 60_000 - now)}
      </p>
    );
  }
  if (phase === "doors") {
    return open(
      <>
        <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 motion-safe:animate-ping" />
          <DoorOpen size={15} className="relative" />
        </span>
        Doors open · Enter <ArrowRight size={15} className="ml-auto" aria-hidden />
      </>,
      "bg-accent text-white hover:bg-accent/90",
    );
  }
  if (phase === "live") {
    return open(
      <>
        <Radio size={16} className="motion-safe:animate-pulse" aria-hidden /> Live · {pass.inside} inside <ArrowRight size={15} className="ml-auto" aria-hidden />
      </>,
      "bg-accent text-white hover:bg-accent/90",
    );
  }
  if (phase === "ended") {
    return (
      <Link href={`/meetings/${pass.id}/minutes`} className={cn(base, "text-ink hover:bg-ink/5")}>
        <FileText size={16} aria-hidden /> Ended · View minutes <ArrowRight size={15} className="ml-auto" aria-hidden />
      </Link>
    );
  }
  return (
    <p className={cn(base, "text-ink/70")}>
      <XCircle size={16} aria-hidden /> Cancelled
    </p>
  );
}

function Face({ pass, owner, phase, now, onEnter, side, hidden }: { pass: Pass; owner: PassOwner | null; phase: MeetingPhase; now: number; onEnter?: () => void; side: "front" | "back"; hidden: boolean }) {
  const name = owner?.name ?? "Member";
  return (
    <article className={cn("meeting-pass__face cut-corner flex flex-col overflow-hidden", `meeting-pass__face--${side}`)} inert={hidden}>
      <div className="relative flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 pr-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">FusionX Meeting Pass</p>
        </div>
        <div>
          <h3 className="font-serif text-xl leading-snug text-ink sm:text-2xl">{pass.title}</h3>
          <p className="mt-1 text-sm text-ink/75">{istDateTime(pass.starts_at)}</p>
          <p className="text-sm text-ink/65">
            {pass.duration_min} min · Host: {pass.host}
          </p>
        </div>
        {pass.agenda.length > 0 && (
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink/70">
            {pass.agenda.slice(0, 3).map((item, i) => (
              <li key={`${i}-${item}`} className="truncate">
                {item}
              </li>
            ))}
            {pass.agenda.length > 3 && <li className="list-none text-xs text-ink/55">and {pass.agenda.length - 3} more</li>}
          </ol>
        )}
        <div className="mt-auto flex items-center gap-3 border-t border-line pt-4">
          {owner?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- can be a Google or GitHub picture
            <img src={owner.avatar_url} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-accent" />
          ) : (
            <InitialsAvatar name={name} className="h-11 w-11" />
          )}
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-ink">{name}</p>
            <p className="truncate text-ink/70">{pass.seat.label}</p>
          </div>
        </div>
        {pass.cant_reason && <p className="text-xs text-ink/65">You said you can&rsquo;t make it: {pass.cant_reason}</p>}
      </div>
      <Strip pass={pass} phase={phase} now={now} onEnter={onEnter} />
    </article>
  );
}

/**
 * A person's ticket for one meeting. Its strip follows the clock while the page is
 * open: "Doors open in 2 h 14 min", then from 10 minutes before it flips to
 * "Doors open · Enter", then "Live · 12 inside", then "Ended · View minutes".
 */
export function MeetingPass({ pass, owner, serverNow, onEnter }: { pass: Pass; owner: PassOwner | null; serverNow: string; onEnter?: () => void }) {
  const { tick } = useServerClock(serverNow);
  const now = tick ?? new Date(serverNow).getTime();
  const phase = passPhase(pass, now);
  const router = useRouter();
  const open = phase === "doors" || phase === "live";

  // While it is open, the number inside and the phase are read again.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => router.refresh(), 20000);
    return () => window.clearInterval(timer);
  }, [open, router]);

  return (
    <div className="meeting-pass h-full" data-flipped={phase !== "upcoming"} data-phase={phase}>
      <div className="meeting-pass__inner h-full">
        <Face pass={pass} owner={owner} phase="upcoming" now={now} side="front" hidden={phase !== "upcoming"} />
        <Face pass={pass} owner={owner} phase={phase === "upcoming" ? "doors" : phase} now={now} onEnter={onEnter} side="back" hidden={phase === "upcoming"} />
      </div>
    </div>
  );
}
