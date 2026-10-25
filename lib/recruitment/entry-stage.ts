/**
 * The candidate entry's stages (no database here, so the header button can use it in the browser as time passes).
 * See lib/recruitment/my-entry.ts.
 */

/** Days the entry stays after the candidate answered their offer. */
export const HIDE_DAYS_AFTER_ANSWER = 3;
/** Days the entry stays after the results are out (also for waitlisted, not selected and absent). */
export const HIDE_DAYS_AFTER_RESULTS = 14;

export type CandidateStage = "interview" | "application" | "result";

export type CandidateEntry = {
  stage: CandidateStage;
  label: string;
  href: string;
  /** The database's clock when this was read (the button counts down from it). */
  now: string;
  day: string;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  closesAt: string;
  /** The interview is in the website's room (else Google Meet / in person). */
  room: boolean;
  online: boolean;
  resultsAt: string | null;
  /** For "seen once" (the dot): changes with each cycle and stage. */
  key: string;
};


/** Stage, label and link for a moment (the button runs this again on the client as time passes). */
export function stageAt(e: Pick<CandidateEntry, "opensAt" | "closesAt" | "room" | "resultsAt">, now: number, resultsOut: boolean, booked: boolean) {
  if (resultsOut || (e.resultsAt && now >= new Date(e.resultsAt).getTime())) return { stage: "result" as const, label: "My Result", href: "/recruitment/status" };
  if (booked && now <= new Date(e.closesAt).getTime()) {
    const open = e.room && now >= new Date(e.opensAt).getTime();
    return { stage: "interview" as const, label: "My Interview", href: open ? "/recruitment/interview" : "/recruitment/status" };
  }
  return { stage: "application" as const, label: "My Application", href: "/recruitment/status" };
}
