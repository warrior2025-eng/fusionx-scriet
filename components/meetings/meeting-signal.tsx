"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, PhoneCall, PhoneOff, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { MeetingSignal } from "@/lib/meetings/data";
import { cn } from "@/lib/utils";

/**
 * What every page needs about meetings: the "Join meeting · Live" button and the
 * incoming-call banner. One small question to the database every few seconds, while
 * the tab is visible, shared by everything on the page.
 */
const EVERY_MS = 10000;
let current: MeetingSignal | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();
const publish = (next: MeetingSignal | null) => {
  current = next;
  listeners.forEach((l) => l());
};
async function ask() {
  if (document.visibilityState !== "visible") return;
  const { data, error } = await createClient().rpc("my_meeting_signal");
  if (!error && data) publish(data as MeetingSignal);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => void ask(), EVERY_MS);
    void ask();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function useSignal(initial: MeetingSignal | null) {
  return useSyncExternalStore(subscribe, () => current ?? initial, () => initial);
}

/** A soft two-note ring, repeated. Silent where the browser has not allowed sound yet. */
function useRingTone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let audio: AudioContext | null = null;
    try {
      audio = new AudioContext();
      void audio.resume().catch(() => {});
    } catch {
      return;
    }
    const ctx = audio;
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + at);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + at + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.5);
    };
    const ring = () => {
      note(660, 0);
      note(880, 0.5);
    };
    ring();
    const repeat = window.setInterval(ring, 3000);
    return () => {
      window.clearInterval(repeat);
      void ctx.close().catch(() => {});
    };
  }, [active]);
}

// Never over someone's interview: the recruitment rooms stay exactly as they are.
const QUIET = /^\/(recruitment\/interview|review\/interviews\/day|admin\/interviews\/day)/;

export function MeetingRingBanner({ initial }: { initial: MeetingSignal | null }) {
  const signal = useSignal(initial);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [answered, setAnswered] = useState<string | null>(null);
  const ring = signal?.ring && signal.ring.id !== answered && !QUIET.test(pathname) ? signal.ring : null;
  const shown = useRef<string | null>(null);
  useRingTone(Boolean(ring));

  useEffect(() => {
    if (!ring || shown.current === ring.id) return;
    shown.current = ring.id;
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification(`${ring.host} is calling you`, { body: ring.title, tag: ring.id });
      }
    } catch {}
  }, [ring]);

  if (!ring) return null;
  const reply = async (answer: "join" | "cant") => {
    setAnswered(ring.id);
    await createClient().rpc("meeting_ring_answer", { p_ring: ring.id, p_answer: answer });
    if (answer === "join") router.push(`/meetings/${ring.meeting_id}?enter=1`);
  };
  return (
    <div role="alertdialog" aria-label="Incoming meeting call" className="fixed inset-x-3 top-3 z-[80] mx-auto max-w-xl border border-accent bg-surface p-4 shadow-2xl sm:p-5">
      <p className="flex items-start gap-3 text-sm font-medium text-ink sm:text-base">
        <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent/60 motion-safe:animate-ping" aria-hidden />
          <PhoneCall size={15} className="relative" aria-hidden />
        </span>
        <span>
          {ring.host} is calling you into &lsquo;{ring.title}&rsquo;
        </span>
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void reply("cant")}>
          <PhoneOff size={14} aria-hidden /> Can&rsquo;t join
        </Button>
        <Button type="button" size="sm" onClick={() => void reply("join")}>
          <Video size={14} aria-hidden /> Join now
        </Button>
      </div>
    </div>
  );
}

/** "Join meeting · Live": highlighted while a meeting of mine is live or starts within 10 minutes. */
export function MeetingLiveButton({ initial, place, onNavigate }: { initial: MeetingSignal | null; place: "header" | "mobile-menu"; onNavigate?: () => void }) {
  const signal = useSignal(initial);
  const soon = signal?.soon;
  if (!soon) return null;
  return (
    <Link
      href={`/meetings/${soon.id}?enter=1`}
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-accent font-semibold text-white hover:bg-accent/90",
        place === "header" ? "px-3 py-1.5 text-[13px]" : "w-full justify-center px-4 py-3 text-sm",
      )}
    >
      <span className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
      Join meeting · {soon.phase === "live" ? "Live" : "Doors open"}
    </Link>
  );
}

/** "Meetings" in the account and mobile menus, for anyone with an upcoming pass. */
export function MeetingsMenuLink({ initial, className, onNavigate }: { initial: MeetingSignal | null; className?: string; onNavigate?: () => void }) {
  const signal = useSignal(initial);
  if (!signal?.has_upcoming) return null;
  return (
    <Link href="/meetings" onClick={onNavigate} className={className}>
      <CalendarClock size={14} className="mr-1.5 inline" aria-hidden />
      Meetings
    </Link>
  );
}
