/**
 * Compact day / month block for an event date. Parses the `YYYY-MM-DD` date
 * column as a calendar date (no timezone shift).
 */
export function DateBlock({ date }: { date: string }) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const monthLabel = d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  return (
    <time
      dateTime={date}
      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center border border-line bg-paper/60 leading-none"
    >
      <span className="font-serif text-xl font-medium tabular-nums text-ink">{d.getUTCDate()}</span>
      <span className="mt-1 text-[11px] font-medium tracking-[0.08em] text-ink/60">{monthLabel}</span>
    </time>
  );
}
