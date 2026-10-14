"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Info } from "lucide-react";
import { bookSlot, loadSlots } from "@/actions/recruitment-slots";
import {
  MODE_LABELS,
  dayLabel,
  groupSlots,
  seatsText,
  slotAriaLabel,
  slotRange,
  type SlotAvailability,
} from "@/lib/recruitment/slots";
import { cn } from "@/lib/utils";

const REFRESH_MS = 20_000;

/**
 * The interview slot picker. Clicking a free slot books it at once (or moves
 * the candidate's booking there); the database holds the seat count, so the
 * list is refreshed when the picker opens, every 20 seconds while it is open,
 * and straight after a failed booking.
 */
export function SlotPicker({
  cycleId,
  initial,
  instructions,
  onChange,
}: {
  cycleId: string;
  initial: SlotAvailability[];
  instructions: string;
  /** Called with the slot the candidate now holds (or null). */
  onChange?: (slot: SlotAvailability | null) => void;
}) {
  const [slots, setSlots] = useState(initial);
  const [dayId, setDayId] = useState(() => (initial.find((s) => s.mine) ?? initial.find((s) => s.state === "available") ?? initial[0])?.day_id ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadSlots(cycleId);
    setSlots(next);
    return next;
  }, [cycleId]);

  // Fresh numbers when the picker opens, then every 20 seconds while it is on screen
  // (skipped while the tab is hidden; refreshed at once when it comes back).
  useEffect(() => {
    let live = true;
    const tick = () => {
      if (document.hidden) return;
      void loadSlots(cycleId).then((next) => {
        if (live) setSlots(next);
      });
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [cycleId]);

  const mine = slots.find((s) => s.mine) ?? null;
  useEffect(() => onChange?.(mine), [mine, onChange]);

  const days = groupSlots(slots);
  const shown = days.find((d) => d.dayId === dayId) ?? days[0];

  function choose(slot: SlotAvailability) {
    if (slot.mine || slot.state !== "available") return;
    setMessage(null);
    setBusySlot(slot.slot_id);
    startTransition(async () => {
      const result = await bookSlot(slot.slot_id);
      await refresh();
      setBusySlot(null);
      if (result.ok) {
        setMessage({ tone: "ok", text: `${result.moved ? "Slot changed" : "Slot booked"}: ${dayLabel(slot.day)}, ${slotRange(slot.starts_at, slot.ends_at)} IST.` });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  if (slots.length === 0) {
    return <p className="text-sm text-ink/70">No interview slots are open right now. Please check again later.</p>;
  }

  return (
    <div>
      <p className="flex gap-2 border border-line bg-accent-soft px-4 py-3 text-sm leading-relaxed text-ink">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        {instructions}
      </p>

      {mine && (
        <p className="mt-4 text-sm text-ink">
          Your slot: <span className="font-semibold">{dayLabel(mine.day)}, {slotRange(mine.starts_at, mine.ends_at)} IST</span>
          <span className="text-ink/65"> ({MODE_LABELS[mine.mode]})</span>
        </p>
      )}

      {days.length > 1 && (
        <div role="tablist" aria-label="Interview dates" className="mt-5 flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d.dayId}
              type="button"
              role="tab"
              aria-selected={d.dayId === shown.dayId}
              onClick={() => setDayId(d.dayId)}
              className={cn(
                "border px-3 py-1.5 text-sm font-medium transition-colors",
                d.dayId === shown.dayId ? "border-accent bg-accent text-white" : "border-ink/25 text-ink hover:border-ink/60",
              )}
            >
              {dayLabel(d.day)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5" role={days.length > 1 ? "tabpanel" : undefined} aria-label={dayLabel(shown.day, "long")}>
        {days.length === 1 && <p className="mb-3 text-sm font-semibold text-ink">{dayLabel(shown.day, "long")}</p>}
        {shown.groups.map((group, i) => (
          <div key={`${group.label}-${i}`}>
            <p className="mb-3 mt-1 text-sm font-semibold text-ink">
              {group.label} ({group.range})
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.slots.map((slot) => {
                const available = slot.state === "available" && !slot.mine;
                return (
                  <li key={slot.slot_id}>
                    <button
                      type="button"
                      onClick={() => choose(slot)}
                      disabled={!available || pending}
                      aria-pressed={slot.mine}
                      aria-label={slotAriaLabel(slot)}
                      className={cn(
                        "flex h-full w-full flex-col items-start border px-3 py-2 text-left transition-colors",
                        slot.mine && "border-accent bg-accent text-white",
                        available && "border-ink/25 text-ink hover:border-accent hover:bg-accent-soft",
                        !slot.mine && slot.state !== "available" && "cursor-not-allowed border-line bg-paper text-ink/45",
                        busySlot === slot.slot_id && "opacity-60",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {slot.mine && <Check size={14} aria-hidden />}
                        {slotRange(slot.starts_at, slot.ends_at)}
                      </span>
                      <span className={cn("mt-0.5 text-xs", slot.mine ? "text-white/90" : available ? "text-ink/65" : "")}>
                        {busySlot === slot.slot_id ? "Booking…" : seatsText(slot)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {shown.breaks[i] && (
              <p className="my-5 flex items-center gap-3 text-xs font-medium text-ink/65">
                <span className="h-px flex-1 bg-line" aria-hidden />
                {shown.breaks[i]}
                <span className="h-px flex-1 bg-line" aria-hidden />
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink/65">All times are India Standard Time (IST). Seats refresh every 20 seconds.</p>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-4 border px-4 py-3 text-sm",
            message.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-600" : "border-accent/40 bg-accent-soft text-ink",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
