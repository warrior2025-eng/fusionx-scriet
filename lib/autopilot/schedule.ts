/**
 * When each automation runs next (IST), as scheduled in supabase/setup/autopilot_cron.sql. Pure.
 */
export const AUTOMATIONS = [
  { key: "ideas", label: "Sunday project ideas", when: { days: [0], h: 9, m: 0 } },
  { key: "research", label: "Monthly research topics", when: { days: [0], h: 9, m: 10, firstWeek: true } },
  { key: "opportunities", label: "Daily opportunities", when: { days: [0, 1, 2, 3, 4, 5, 6], h: 7, m: 0 } },
  { key: "tools", label: "Daily tool", when: { days: [0, 1, 2, 3, 4, 5, 6], h: 6, m: 0 } },
  { key: "ai_refresh", label: "FusionX AI knowledge refresh", when: { days: [0, 1, 2, 3, 4, 5, 6], h: 7, m: 30 } },
] as const;

/** e.g. "Sun 16 Nov, 9:00 am". `now` is passed in so pages stay pure. */
export function nextRun(key: (typeof AUTOMATIONS)[number]["key"], now: Date = new Date()): string {
  const a = AUTOMATIONS.find((x) => x.key === key)!;
  const ist = new Date(now.getTime() + 330 * 60_000); // IST clock in UTC fields
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + i, a.when.h, a.when.m));
    if (d <= ist) continue;
    if (!(a.when.days as readonly number[]).includes(d.getUTCDay())) continue;
    if ("firstWeek" in a.when && a.when.firstWeek && d.getUTCDate() > 7) continue;
    return d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  }
  return "—";
}
