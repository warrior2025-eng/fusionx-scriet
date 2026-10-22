import Link from "next/link";
import { Panel, Pill } from "@/components/admin/ui";
import { slotPhase } from "@/lib/interview/shared";
import { dayLabel, slotRange } from "@/lib/recruitment/slots";

export type ListSlot = {
  id: string;
  day: string;
  starts_at: string;
  ends_at: string;
  room: boolean;
  candidates: { name: string; hubs: string; status: "booked" | "attended" | "no_show" }[];
};

const PHASE = { upcoming: "Upcoming", live: "Live", done: "Done" } as const;
const PHASE_TONE = { upcoming: "neutral", live: "good", done: "neutral" } as const;
const STATUS = { booked: "Booked", attended: "Attended", no_show: "No-show" } as const;

/** Interview slots by date, with each slot's candidates, for the panel to pick one. */
export function SlotList({ slots, base }: { slots: ListSlot[]; base: string }) {
  if (slots.length === 0) return <Panel title="No interviews">{<p className="text-sm text-ink/70">No booked interview slots yet.</p>}</Panel>;
  const days = [...new Set(slots.map((s) => s.day))].sort();
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <Panel key={day} title={dayLabel(day, "long")}>
          <ul className="divide-y divide-line">
            {slots
              .filter((s) => s.day === day)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((s) => {
                const phase = slotPhase(s.starts_at, s.ends_at);
                return (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {slotRange(s.starts_at, s.ends_at)}
                        <Pill tone={PHASE_TONE[phase]}>{PHASE[phase]}</Pill>
                        {s.room ? <Pill tone="good">In-website room</Pill> : <Pill>Google Meet</Pill>}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {s.candidates.map((c, i) => (
                          <li key={i} className="text-ink">
                            {c.name} <span className="text-ink/65">· {c.hubs || "No hub"} · {STATUS[c.status]}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link href={`${base}/${s.id}`} className="shrink-0 text-sm font-medium text-accent underline underline-offset-2">
                      Open the panel
                    </Link>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
