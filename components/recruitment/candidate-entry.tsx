"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardList, Trophy, Video } from "lucide-react";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { stageAt, type CandidateEntry } from "@/lib/recruitment/entry-stage";
import type { LiveDay } from "@/lib/recruitment/my-entry";
import { dayLabel, slotRange, slotTime } from "@/lib/recruitment/slots";
import { cn } from "@/lib/utils";

/**
 * "My Interview" → "My Application" → "My Result": the candidate's highlighted way in (header, mobile menu,
 * account menu, a bar at the bottom of phones, a card on the home page). The stage moves on by the database's
 * clock while the page is open; the result itself is only shown on the status page after the publish time.
 */
function useEntry(entry: CandidateEntry) {
  const { tick } = useServerClock(entry.now);
  const now = tick ?? new Date(entry.now).getTime();
  const s = stageAt(entry, now, entry.stage === "result", entry.stage === "interview");
  const opens = new Date(entry.opensAt).getTime();
  const closes = new Date(entry.closesAt).getTime();
  const live = s.stage === "interview" && entry.room && now >= opens && now <= closes;
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === entry.day;
  const startsIn = new Date(entry.startsAt).getTime() - now;
  const chip =
    s.stage !== "interview"
      ? null
      : live
        ? "Live now"
        : startsIn > 0 && startsIn <= 60 * 60_000
          ? `Starts in ${Math.max(1, Math.ceil(startsIn / 60_000))} min`
          : today
            ? `Today, ${slotTime(entry.startsAt)}`
            : dayLabel(entry.day).replace(/^\w+,\s*/, "");
  return { ...s, live, today, chip, now };
}

/** The result dot: shown until the candidate has opened their result once. */
function useSeen(key: string, active: boolean) {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      try {
        setSeen(localStorage.getItem(`fx-entry-seen:${key}`) === "1");
      } catch {
        setSeen(true);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [key, active]);
  const mark = () => {
    try {
      localStorage.setItem(`fx-entry-seen:${key}`, "1");
    } catch {}
    setSeen(true);
  };
  return { dot: active && !seen, mark };
}

const ICON = { interview: Video, application: ClipboardList, result: Trophy } as const;

/** The button in the header (desktop), the top of the mobile menu, and an item in the account menu. */
export function CandidateEntryButton({ entry, place, onNavigate }: { entry: CandidateEntry; place: "header" | "mobile-menu" | "menu"; onNavigate?: () => void }) {
  const e = useEntry(entry);
  const { dot, mark } = useSeen(entry.key, e.stage === "result");
  const Icon = ICON[e.stage];
  const click = () => {
    mark();
    onNavigate?.();
  };
  if (place === "menu") {
    return (
      <Link href={e.href} onClick={click} className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-accent-text hover:bg-ink/5">
        <Icon size={15} aria-hidden /> {e.label}
        {e.chip && <span className="ml-auto text-xs font-medium text-ink/70">{e.chip}</span>}
        {dot && <span className="ml-auto h-2 w-2 rounded-full bg-red-500" aria-label="New" />}
      </Link>
    );
  }
  return (
    <Link
      href={e.href}
      onClick={click}
      aria-label={`${e.label}${e.chip ? `, ${e.chip}` : ""}${dot ? ", new" : ""}`}
      className={cn(
        "relative inline-flex items-center gap-2 whitespace-nowrap rounded-sm bg-[#004df6] font-semibold text-white shadow-sm hover:bg-[#003dd1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004df6]",
        place === "header" ? "px-3.5 py-2 text-sm" : "w-full justify-center px-4 py-3 text-base",
      )}
    >
      {e.live && <span className="pointer-events-none absolute -inset-1 rounded-md border-2 border-[#004df6] motion-safe:animate-ping" aria-hidden />}
      <Icon size={place === "header" ? 16 : 18} aria-hidden />
      {e.label}
      {e.chip && (
        <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-semibold", e.live ? "bg-white text-[#004df6]" : "bg-white/20 text-white")}>{e.chip}</span>
      )}
      {dot && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500" aria-hidden />}
    </Link>
  );
}

/** Phones: always one tap away, at the bottom of public pages (not on the interview room page itself). */
export function CandidateEntryBar({ entry }: { entry: CandidateEntry }) {
  const pathname = usePathname();
  const e = useEntry(entry);
  const { dot, mark } = useSeen(entry.key, e.stage === "result");
  if (pathname?.startsWith("/recruitment/interview")) return null;
  const Icon = ICON[e.stage];
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 p-3 backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <Link
        href={e.href}
        onClick={mark}
        className="relative flex w-full items-center justify-center gap-2 rounded-sm bg-[#004df6] px-4 py-3 text-base font-semibold text-white shadow-lg"
      >
        {e.live && <span className="pointer-events-none absolute -inset-1 rounded-md border-2 border-[#004df6] motion-safe:animate-ping" aria-hidden />}
        <Icon size={18} aria-hidden /> {e.label}
        {e.chip && <span className="font-medium text-white/90">· {e.chip.replace(/^Starts in/, "starts in")}</span>}
        {dot && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500" aria-hidden />}
      </Link>
    </div>
  );
}

/** The home page card (signed-in candidates only), following the same stages. */
export function CandidateEntryCard({ entry }: { entry: CandidateEntry }) {
  const e = useEntry(entry);
  const { mark } = useSeen(entry.key, e.stage === "result");
  const start = new Date(entry.startsAt).getTime();
  const resultsAt = entry.resultsAt ? new Date(entry.resultsAt).getTime() : null;
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-2 border-[#004df6] bg-paper/90 p-4 shadow-lg sm:p-5" role="status">
      <div className="min-w-0">
        {e.stage === "interview" && (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-text">Your interview</p>
            <p className="mt-1 font-medium text-ink">
              {dayLabel(entry.day)}, {slotRange(entry.startsAt, entry.endsAt)} IST
              {entry.online && entry.room ? " · Online on the FusionX@SCRIET website" : ""}
            </p>
            <p className="mt-1 text-sm tabular-nums text-ink/75">{e.live ? "The room is open now." : start > e.now ? `Starts in ${countdownText(start - e.now)}` : ""}</p>
          </>
        )}
        {e.stage === "application" && (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-text">Interview done</p>
            <p className="mt-1 font-medium text-ink">
              {resultsAt ? `Results on ${new Date(resultsAt).toLocaleString("en-IN", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : "Results will be announced soon."}
            </p>
            {resultsAt && resultsAt > e.now && <p className="mt-1 text-sm tabular-nums text-ink/75">In {countdownText(resultsAt - e.now)}</p>}
          </>
        )}
        {e.stage === "result" && (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-text">Recruitment</p>
            <p className="mt-1 font-medium text-ink">Your result is out.</p>
          </>
        )}
      </div>
      {e.stage === "interview" ? (
        e.live ? (
          <Link href="/recruitment/interview" className="inline-flex items-center gap-2 rounded-sm bg-[#004df6] px-5 py-3 font-semibold text-white hover:bg-[#003dd1]">
            <Video size={18} aria-hidden /> Join interview room
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-sm bg-ink/10 px-5 py-3 font-semibold text-ink/60" aria-disabled>
            <Video size={18} aria-hidden /> Join interview room
          </span>
        )
      ) : (
        <Link href="/recruitment/status" onClick={mark} className="inline-flex items-center gap-2 rounded-sm bg-[#004df6] px-5 py-3 font-semibold text-white hover:bg-[#003dd1]">
          {e.stage === "result" ? (
            <>
              <Trophy size={18} aria-hidden /> View result
            </>
          ) : (
            <>
              <ClipboardList size={18} aria-hidden /> My Application
            </>
          )}
        </Link>
      )}
    </div>
  );
}

/** "Reviewer panel · Live" while today's interviews are on (header, mobile menu). */
export function ReviewerLiveButton({ live, place, onNavigate }: { live: LiveDay; place: "header" | "mobile-menu"; onNavigate?: () => void }) {
  const { tick } = useServerClock(live.now);
  const chip = live.slotStartsAt && live.slotEndsAt ? slotRange(live.slotStartsAt, live.slotEndsAt) : null;
  const on = tick !== null && live.slotStartsAt && tick >= new Date(live.slotStartsAt).getTime();
  return (
    <Link
      href={live.href}
      onClick={onNavigate}
      className={cn(
        "relative inline-flex items-center gap-2 whitespace-nowrap rounded-sm bg-[#004df6] font-semibold text-white shadow-sm hover:bg-[#003dd1]",
        place === "header" ? "px-3.5 py-2 text-sm" : "w-full justify-center px-4 py-3 text-base",
      )}
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      Reviewer panel
      <span className="rounded-sm bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#004df6]">{on ? "Live" : "Today"}</span>
      {chip && place === "mobile-menu" && <span className="text-sm font-medium text-white/90">{chip}</span>}
    </Link>
  );
}
