import Link from "next/link";
import type { PanelAccess } from "@/actions/interview-panel";
import { PanelView } from "@/components/interview/panel-view";
import { currentSlot, slotPhase, type DayAccess } from "@/lib/interview/shared";
import { slotRange, slotTime } from "@/lib/recruitment/slots";
import type { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The day room's sidebar: a slot picker, and the chosen slot's candidates
 * (details, attendance, integrity, questions, scoring: the existing panel
 * view). With no ?slot= it follows the slot on now, by the database's clock,
 * and moves on by itself at each boundary (the shell fetches the page again).
 */
export async function DaySidebar({
  supabase,
  access,
  userId,
  base,
  pinned,
}: {
  supabase: Supabase;
  access: DayAccess;
  userId: string;
  base: string;
  pinned: string | undefined;
}) {
  const nowMs = new Date(access.now).getTime();
  const live = currentSlot(access.slots, nowMs);
  const chosen = access.slots.find((s) => s.id === pinned) ?? live;
  if (!chosen) return <p className="text-sm text-ink/70">This day has no slots yet.</p>;

  const { data } = await supabase.rpc("interview_panel_access", { p_slot: chosen.id });
  const slotAccess = data as PanelAccess | null;

  return (
    <div>
      {/* Compact: the sidebar keeps its room for the candidates. */}
      <details className="border-b border-line bg-surface px-3 py-2" open={Boolean(pinned && chosen.id !== live?.id)}>
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-ink">
            {pinned && chosen.id !== live?.id ? "Looking at another slot" : "Following the current slot"} · {slotRange(chosen.starts_at, chosen.ends_at)}
          </span>
          <span className="text-xs text-ink/65">Change slot</span>
        </summary>
        <nav aria-label="Slots of the day" className="pt-2">
        <div className="flex items-center justify-end gap-3">
          {pinned && chosen.id !== live?.id && (
            <Link href={base} className="text-sm font-medium text-accent underline underline-offset-2">
              Back to the current slot
            </Link>
          )}
        </div>
        <ul className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {access.slots.map((s) => {
            const phase = slotPhase(s.starts_at, s.ends_at, nowMs);
            return (
              <li key={s.id}>
                <Link
                  href={s.id === live?.id ? base : `${base}?slot=${s.id}`}
                  aria-current={s.id === chosen.id ? "true" : undefined}
                  title={`${slotRange(s.starts_at, s.ends_at)} · ${s.booked} booked`}
                  className={cn(
                    "inline-block border px-2 py-1 text-xs tabular-nums",
                    s.id === chosen.id ? "border-accent bg-accent text-white" : "border-ink/25 text-ink hover:border-ink/60",
                    phase === "done" && s.id !== chosen.id && "text-ink/55",
                    phase === "live" && s.id !== chosen.id && "border-accent",
                  )}
                >
                  {slotTime(s.starts_at)}
                  <span className="ml-1 opacity-75">({s.booked})</span>
                </Link>
              </li>
            );
          })}
        </ul>
        </nav>
      </details>
      {slotAccess ? (
        <PanelView supabase={supabase} access={slotAccess} userId={userId} dayMode />
      ) : (
        <p className="border border-line bg-surface p-4 text-sm text-ink/70">
          {chosen.booked === 0 ? "No candidates booked in this slot." : "No candidates of your hubs in this slot."}
        </p>
      )}
    </div>
  );
}
