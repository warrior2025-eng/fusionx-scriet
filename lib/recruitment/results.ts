/**
 * Recruitment results: shapes, labels and small pure helpers shared by the
 * status page, the public results page and the admin board. Nothing here
 * touches the database, so client components may import it.
 *
 * Whether results may be shown is decided in the database
 * (recruitment_results_visible); resultsVisible() below only mirrors it for
 * things like the header badge, which carry no decision.
 */

export type Decision = "selected" | "waitlisted" | "not_selected";
export type DecisionReason = "absent" | "one_hub" | "override" | "declined" | "expired" | "removed";
export type OfferStatus = "pending" | "accepted" | "declined" | "expired";
export type Attendance = "attended" | "no_show" | "booked" | "none";
export type Outcome = "selected" | "waitlisted" | "not_selected" | "absent" | "declined" | "expired" | "in_review";

/** One hub the candidate is selected in, with its own link and its own answer. */
export type SelectedHub = {
  team_id: string;
  team_name: string;
  whatsapp_url: string | null;
  offer_status: OfferStatus | null;
  offer_deadline: string | null;
  can_respond: boolean;
};

export type ResultHub = {
  team_id: string;
  team_name: string;
  rank: number;
  decision: string;
  reason: DecisionReason | null;
  waitlist_rank: number | null;
  message: string | null;
};

/** What get_my_result / preview_candidate_result return. */
export type MyResult =
  | { state: "none" }
  | { state: "pending"; publish_at: string | null; scheduled: boolean; consent: boolean }
  | {
      state: "published" | "preview";
      outcome: Outcome;
      hub: string | null;
      name: string | null;
      cycle_title: string;
      consent: boolean;
      hubs: ResultHub[];
      selected: SelectedHub | null;
      /** Every selected hub, in order of preference (migration 0029). */
      selected_hubs?: SelectedHub[];
      induction: { at: string | null; mode: "online" | "in_person" | null; link: string | null; venue: string | null; note: string | null } | null;
    };

export type PublicHub = {
  team_id: string;
  name: string;
  emoji: string | null;
  selected: string[];
  selected_total: number;
  waitlist: { name: string; rank: number }[];
  waitlist_total: number;
};

/** What get_public_results / preview_public_results return. */
export type PublicResults =
  | { state: "none" }
  | { state: "pending"; cycle_title: string; publish_at: string | null; scheduled: boolean }
  | {
      state: "published" | "preview";
      cycle_title: string;
      publish_at: string | null;
      show_selected: boolean;
      show_waitlist: boolean;
      hubs: PublicHub[];
      /** Everyone selected counts once; places count once per hub (migration 0029). */
      selected_people?: number;
      selected_places?: number;
      just_published?: boolean;
    };

export type Readiness = {
  undecided: number;
  undecided_attended: number;
  conflicts: number;
  conflict_names: string[];
  /** Selected in more than one hub, and allowed to be (migration 0029). */
  multi_hub?: number;
  selected_people?: number;
  selected_places?: number;
  locked: boolean;
  scheduled: boolean;
  visible: boolean;
};

/** The result columns a cycle row carries (migration 0017). */
export type CycleResults = {
  decisions_locked?: boolean;
  results_publish_at?: string | null;
  results_scheduled?: boolean;
  results_published_at?: string | null;
  one_hub_mode?: "not_selected" | "keep_waitlisted" | "allow_multiple";
  show_selected_publicly?: boolean;
  show_waitlist_publicly?: boolean;
  results_banner_on?: boolean;
  results_banner_text?: string;
};

export const DECISION_LABELS: Record<Decision | "undecided", string> = {
  undecided: "Undecided",
  selected: "Selected",
  waitlisted: "Waitlisted",
  not_selected: "Not selected",
};

export const REASON_LABELS: Record<DecisionReason, string> = {
  absent: "Absent",
  one_hub: "Selected in another hub",
  override: "Absent, overridden",
  declined: "Declined the offer",
  expired: "Offer expired",
  removed: "Removed from waitlist",
};

export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  attended: "Attended",
  no_show: "Absent",
  booked: "Not marked",
  none: "No slot",
};

export const OFFER_LABELS: Record<OfferStatus, string> = {
  pending: "Waiting for answer",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** The result date asked for this cycle, as a datetime-local value in IST. */
export const DEFAULT_RESULTS_INPUT = "2026-10-25T18:00";

export const WAITLIST_NOTE = "Waitlisted candidates may be offered a seat if one becomes available.";
export const CONSENT_NOTICE =
  "If you are selected or waitlisted, your name and hub will be announced on the FusionX@SCRIET website and official social media channels.";

/** Mirrors recruitment_results_visible() for display only (never to reveal a decision). */
export function resultsVisible(cycle: ({ status: string } & CycleResults) | null, now = Date.now()): boolean {
  if (!cycle || cycle.status === "draft") return false;
  if (cycle.status === "results_published") return true;
  return Boolean(cycle.results_scheduled && cycle.results_publish_at && now >= new Date(cycle.results_publish_at).getTime());
}

const IST = "Asia/Kolkata";

/** "25 October 2026 at 6:00 PM" in IST. */
export function announceWhen(value: string): string {
  const d = new Date(value);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: IST });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).replace(/ /g, " ");
  return `${date} at ${time}`;
}

/** The sentence candidates see before the results. */
export function announcement(publishAt: string | null | undefined): string {
  return publishAt
    ? `Results will be announced on ${announceWhen(publishAt)} on this page and on FusionX@SCRIET's official social media channels.`
    : "Results will be announced on this page and on FusionX@SCRIET's official social media channels.";
}

/** Fills {name}, {hub}, {team}, {cycle}, {rank}, {selected} and {waitlist} in a template. */
export function fillTemplate(body: string, values: Partial<Record<"name" | "hub" | "cycle" | "rank" | "selected" | "waitlist", string>>): string {
  return body.replace(/\{(name|hub|team|cycle|rank|selected|waitlist)\}/g, (_, key: string) => values[(key === "team" ? "hub" : key) as keyof typeof values] ?? "");
}

/** Where a cycle is in its life, for the admin timeline. */
export type Phase = "draft" | "open" | "closed" | "deciding" | "locked" | "scheduled" | "published";
export const PHASES: { key: Phase; label: string }[] = [
  { key: "open", label: "Registration open" },
  { key: "closed", label: "Registration closed, interviews" },
  { key: "deciding", label: "Decisions being finalised" },
  { key: "locked", label: "Decisions locked" },
  { key: "scheduled", label: "Results scheduled" },
  { key: "published", label: "Results published" },
];

export function phaseOf(cycle: { status: string; closes_at: string | null } & CycleResults, hasDecisions: boolean, now = Date.now()): Phase {
  if (cycle.status === "draft") return "draft";
  if (resultsVisible(cycle, now)) return "published";
  if (cycle.results_scheduled) return "scheduled";
  if (cycle.decisions_locked) return "locked";
  const closed = cycle.status === "closed" || (cycle.closes_at !== null && now >= new Date(cycle.closes_at).getTime());
  if (!closed) return "open";
  return hasDecisions ? "deciding" : "closed";
}
