import { cache } from "react";
import { getCurrentUser } from "@/lib/permissions";
import { getCurrentCycle } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { HIDE_DAYS_AFTER_ANSWER, HIDE_DAYS_AFTER_RESULTS, stageAt, type CandidateEntry } from "@/lib/recruitment/entry-stage";

export type { CandidateEntry } from "@/lib/recruitment/entry-stage";

/**
 * The candidate's one way in, for the header button, the mobile bar, the account menu, the home card and
 * /interview. It follows their stage (migration 0028, my_recruitment_entry: their own booking only):
 *   1. "My Interview"   until their slot ends (the room when its join window is open, else the status page)
 *   2. "My Application" after the slot, until the results are out
 *   3. "My Result"      from the results time on (the existing time lock); the result itself is only ever read
 *                       on the status page, from get_my_result
 *   4. gone             3 days after they answered their offer, or 14 days after the results, whichever is first
 */

type Raw = {
  now: string;
  booking_status: "booked" | "attended" | "no_show";
  day: string;
  starts_at: string;
  ends_at: string;
  opens_at: string;
  closes_at: string;
  mode: string;
  room: boolean;
  results_at: string | null;
  results_out: boolean;
  answered_at: string | null;
};

const DAY = 86_400_000;

/** The signed-in candidate's entry, or null (no booking, not signed in, or past the hide dates). Once per request. */
export const getCandidateEntry = cache(async (): Promise<CandidateEntry | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const cycle = await getCurrentCycle();
  if (!cycle) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_recruitment_entry", { p_cycle: cycle.id });
  if (error || !data) return null;
  const r = data as Raw;
  const now = new Date(r.now).getTime();
  if (r.results_out) {
    const since = r.results_at ? new Date(r.results_at).getTime() : now;
    if (now > since + HIDE_DAYS_AFTER_RESULTS * DAY) return null;
    if (r.answered_at && now > new Date(r.answered_at).getTime() + HIDE_DAYS_AFTER_ANSWER * DAY) return null;
  }
  const base = { opensAt: r.opens_at, closesAt: r.closes_at, room: r.room, resultsAt: r.results_at };
  const s = stageAt(base, now, r.results_out, r.booking_status === "booked");
  return {
    ...s,
    ...base,
    now: r.now,
    day: r.day,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    online: r.mode === "online_meet",
    key: `${cycle.id}:${s.stage}`,
  };
});

/** Today's interview day this reviewer sits on the panel of, while it is on (30 minutes before the first slot until the last ends). */
export type LiveDay = { dayId: string; href: string; now: string; slotStartsAt: string | null; slotEndsAt: string | null; booked: number };

export const getLiveInterviewDay = cache(async (): Promise<LiveDay | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_live_interview_day");
  if (error || !data) return null;
  const d = data as { day_id: string; admin: boolean; now: string; slot_starts_at: string | null; slot_ends_at: string | null; slot_booked: number };
  return {
    dayId: d.day_id,
    href: d.admin ? `/admin/interviews/day/${d.day_id}` : `/review/interviews/day/${d.day_id}`,
    now: d.now,
    slotStartsAt: d.slot_starts_at,
    slotEndsAt: d.slot_ends_at,
    booked: Number(d.slot_booked ?? 0),
  };
});

/**
 * Where to go after signing in: a candidate who signed in from the home page (no other `next`) lands on their
 * status page while their entry is shown; everything else keeps its `next`. `supabase` is the client that just
 * signed in (its new session is not in the request's cookies yet).
 */
export async function landingAfterSignIn(supabase: Awaited<ReturnType<typeof createClient>>, next: string): Promise<string> {
  if (next !== "/") return next;
  try {
    const cycle = await getCurrentCycle();
    if (!cycle) return next;
    const { data } = await supabase.rpc("my_recruitment_entry", { p_cycle: cycle.id });
    if (!data) return next;
    const r = data as Raw;
    const now = new Date(r.now).getTime();
    if (r.results_out && now > (r.results_at ? new Date(r.results_at).getTime() : now) + HIDE_DAYS_AFTER_RESULTS * DAY) return next;
    if (r.results_out && r.answered_at && now > new Date(r.answered_at).getTime() + HIDE_DAYS_AFTER_ANSWER * DAY) return next;
    return "/recruitment/status";
  } catch {
    return next;
  }
}
