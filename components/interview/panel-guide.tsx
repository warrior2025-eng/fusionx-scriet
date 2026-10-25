"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TONE_CLASS, type StateTone } from "@/components/interview/tile-context";
import { cn } from "@/lib/utils";

/** The ten steps of the day panel, each pointing at a real element (data-tour) when it is on the screen. */
export const GUIDE_STEPS: { target: string; title: string; body: string }[] = [
  { target: "controls", title: "1. Check your camera and mic", body: "The bar at the bottom of the video: microphone, camera, screen share and leave. Turn them on before the first candidate joins." },
  { target: "topbar", title: "2. Now / next slot and the countdown", body: "The slot on now, the next one and the time left. The last 2 minutes turn red." },
  { target: "video", title: "3. Candidates of this slot", body: "Up to 4 candidates, large. Click a tile to enlarge it (the others become a small strip); click again to go back." },
  { target: "tab-candidates", title: "4. Candidate details", body: "Sidebar → Candidates: hubs, answers, links and device. Click a tile or a card to switch candidate." },
  {
    target: "integrity",
    title: "5. Integrity alerts",
    body: "Red: away from the screen (only while connected), camera blocked, no video. Grey: left the room (a closed tab shows grey “Left the room”, not red), removed, slot ended. Phone camera on/off shows here too.",
  },
  { target: "attendance", title: "6. Mark attendance", body: "Attended or No-show for each candidate. Mark No-show if they have not joined 5 minutes after the start." },
  { target: "tab-questions", title: "7. Reveal questions", body: "Sidebar → Questions. Only the questions you reveal are shown to the candidates of this slot." },
  { target: "tab-scores", title: "8. Score and notes", body: "Sidebar → Scores: 1–5 and private notes per hub. Press Save score; you can change it later." },
  { target: "remove", title: "9. Remove a candidate / Ask to re-check devices", body: "Ask to re-check shows the candidate a prompt to fix their camera and mic. Remove only for a real reason: they cannot rejoin, and it is logged." },
  { target: "topbar", title: "10. Slot change", body: "Every 20 minutes the room moves to the next slot by itself: the candidates of the slot that ended are removed, the next ones join." },
];

const TOUR_KEY = "fx-panel-tour-done";

function rectOf(target: string): DOMRect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

/**
 * The guided tour: shown by itself the first time a panel member opens the day panel (remembered in this browser),
 * and again from Help. A ring around the real element and a short note; Skip ends it.
 */
export function PanelTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = GUIDE_STEPS[i];
  const measure = useCallback(() => {
    if (!open || !step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setRect(rectOf(step.target));
  }, [open, step]);
  useLayoutEffect(() => {
    const t = window.setTimeout(measure, 0);
    return () => window.clearTimeout(t);
  }, [measure]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 1000);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [open, measure]);
  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {}
    setI(0);
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, GUIDE_STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, finish]);
  if (!open || !step) return null;

  const pad = 6;
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const tipW = Math.min(340, vw - 24);
  let top = vh / 2 - 90;
  let left = vw / 2 - tipW / 2;
  if (rect) {
    const below = rect.bottom + pad + 10;
    top = below + 190 < vh ? below : Math.max(12, rect.top - pad - 200);
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - tipW / 2), vw - tipW - 12);
  }
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="absolute inset-0 bg-black/45" onClick={finish} aria-hidden />
      {rect && (
        <div
          className="pointer-events-none absolute rounded border-4 border-[#004df6] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] motion-safe:transition-all"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          aria-hidden
        />
      )}
      <div className="absolute border border-line bg-paper p-4 text-ink shadow-xl" style={{ top, left, width: tipW }}>
        <p className="text-xs text-ink/65">
          Step {i + 1} of {GUIDE_STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-semibold">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={finish}>
            Skip
          </Button>
          <span className="flex-1" />
          {i > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          {i < GUIDE_STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setI(i + 1)}>
              Next
            </Button>
          ) : (
            <Button size="sm" onClick={finish}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whether this browser has seen the tour (read after mounting; private mode counts as "seen" if storage fails). */
export function useTourSeen(): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setSeen(localStorage.getItem(TOUR_KEY) === "1");
      } catch {
        setSeen(true);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return [seen, () => setSeen(true)];
}

const LEGEND: { tone: StateTone; text: string }[] = [
  { tone: "red", text: "Away from the screen (while connected), camera blocked, no video received, the last 2 minutes" },
  { tone: "amber", text: "Not joined yet (after 2 minutes), reconnecting, poor connection, not yet scored or marked near the end" },
  { tone: "green", text: "In the room, scored, attendance marked" },
  { tone: "grey", text: "Left the room, removed by the panel, slot ended" },
];

/** "How to interview": the steps, the rules, the colours, and what to do if the room fails. */
export function HelpPanel({ open, onClose, onTour }: { open: boolean; onClose: () => void; onTour: () => void }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-line bg-paper p-5 text-ink shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="help-title" className="font-serif text-2xl">
            How to interview
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-ink/70 hover:text-ink" aria-label="Close help">
            <X size={20} aria-hidden />
          </button>
        </div>
        <Button className="mt-4" size="sm" onClick={onTour}>
          Show guide again
        </Button>
        <h3 className="mt-6 text-sm font-semibold">The rules</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/85">
          <li>Each slot is 20 minutes, with at most 4 candidates.</li>
          <li>Interviews take place in this website room, not on Google Meet.</li>
          <li>No second chance for absentees: mark No-show if a candidate has not joined 5 minutes after the start.</li>
          <li>Candidates are removed automatically when their slot ends; the next slot&rsquo;s candidates join by themselves.</li>
        </ul>
        <h3 className="mt-6 text-sm font-semibold">Step by step</h3>
        <ol className="mt-2 space-y-3 text-sm">
          {GUIDE_STEPS.map((s) => (
            <li key={s.title}>
              <p className="font-medium">{s.title}</p>
              <p className="text-ink/80">{s.body}</p>
            </li>
          ))}
        </ol>
        <h3 className="mt-6 text-sm font-semibold">Colours</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {LEGEND.map((l) => (
            <li key={l.tone} className="flex items-start gap-2">
              <span className={cn("mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize", TONE_CLASS[l.tone])}>{l.tone}</span>
              <span className="text-ink/85">{l.text}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-semibold">If the room fails</h3>
        <p className="mt-2 text-sm text-ink/85">
          Try Leave and Join the call again. If video does not work for everyone, tell an admin: they can switch the day to Google Meet in Recruitment → Interview slots → Interview mode
          (candidates are moved there at once).
        </p>
      </div>
    </div>
  );
}
