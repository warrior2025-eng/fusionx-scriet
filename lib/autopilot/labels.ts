/**
 * Autopilot words and defaults, shared by the server and the browser. The numbers'
 * defaults must match ap_num() in migration 0042.
 */

export type Level = "auto" | "suggest" | "manual";

/** Every area Control can set to Auto, Suggest or Manual. `safe` ones switch with "Switch safe areas to Auto". */
export const AREAS: { key: string; label: string; safe?: boolean; later?: "people" | "outcomes" }[] = [
  { key: "missions_rules", label: "Missions from calendar rules" },
  { key: "missions_opportunities", label: "Missions from opportunities" },
  { key: "pitch_to_mission", label: "Pitch to mission", later: "people" },
  { key: "assignment", label: "Assignment (offering tasks)" },
  { key: "re_offers", label: "Re-offers", safe: true },
  { key: "reminders", label: "Reminders and check-ins", safe: true },
  { key: "escalations", label: "Escalations and late reviews", safe: true },
  { key: "exam_shifts", label: "Moving missions out of club exams" },
  { key: "open_seats", label: "Open seats", later: "people" },
  { key: "community_tasks", label: "Community tasks", later: "people" },
  { key: "rising_talent", label: "Rising Talent", later: "people" },
  { key: "project_support", label: "Project support", later: "people" },
  { key: "idea_projects", label: "Idea Engine: project ideas", later: "outcomes" },
  { key: "idea_research", label: "Idea Engine: research topics", later: "outcomes" },
  { key: "idea_radar", label: "Idea Engine: opportunities radar", later: "outcomes" },
  { key: "digests", label: "Opportunity digests with official links", safe: true, later: "outcomes" },
  { key: "weekly_emails", label: "Weekly email", safe: true },
  { key: "recognition", label: "Recognition", later: "outcomes" },
  { key: "public_updates", label: "Now building and Impact updates", later: "outcomes" },
  { key: "share_cards", label: "Share cards", later: "outcomes" },
  { key: "certificate_drafts", label: "Certificate drafts", later: "outcomes" },
  { key: "push", label: "Phone notifications", safe: true },
];

export const LEVEL_LABEL: Record<Level, string> = { auto: "Auto", suggest: "Suggest", manual: "Manual" };

/** Every Control number, with its default (as in ap_num()). */
export const NUMBERS: { key: string; label: string; def: number; min: number; max: number; unit?: string; later?: "people" | "outcomes" }[] = [
  { key: "weeks_ahead", label: "Create missions this many weeks ahead", def: 3, min: 1, max: 12, unit: "weeks" },
  { key: "offer_timeout_hours", label: "Offer timeout", def: 24, min: 2, max: 168, unit: "hours" },
  { key: "remind_days_before", label: "Reminder before the due day", def: 2, min: 1, max: 14, unit: "days" },
  { key: "escalate_lead_days", label: "Tell the lead after", def: 1, min: 1, max: 14, unit: "days late" },
  { key: "escalate_owner_days", label: "Tell the owner after", def: 3, min: 1, max: 21, unit: "days late" },
  { key: "escalate_center_days", label: "Tell Command Center after", def: 5, min: 1, max: 30, unit: "days late" },
  { key: "review_hours", label: "Review time", def: 48, min: 4, max: 168, unit: "hours" },
  { key: "load_cap", label: "Open tasks per person", def: 2, min: 1, max: 10 },
  { key: "load_cap_exams", label: "Open tasks per person during club exams", def: 1, min: 0, max: 10 },
  { key: "rotation_days", label: "Rotation window", def: 14, min: 1, max: 90, unit: "days" },
  { key: "checkin_weekday", label: "Check-in day (0 Sunday … 6 Saturday)", def: 5, min: 0, max: 6 },
  { key: "weekly_email_weekday", label: "Weekly email day (0 Sunday … 6 Saturday)", def: 1, min: 0, max: 6 },
  { key: "digest_hour", label: "Daily digest hour (IST)", def: 19, min: 0, max: 23 },
  { key: "voting_days", label: "Pitch voting", def: 5, min: 1, max: 30, unit: "days", later: "people" },
  { key: "guest_days", label: "Guest access after the mission ends", def: 7, min: 0, max: 60, unit: "days", later: "people" },
  { key: "community_head_start_hours", label: "Members' head start on open seats", def: 48, min: 0, max: 168, unit: "hours", later: "people" },
  { key: "community_task_limit", label: "Community tasks per person", def: 1, min: 1, max: 5, later: "people" },
  { key: "talent_contributions", label: "Rising Talent: verified contributions", def: 3, min: 1, max: 20, later: "people" },
  { key: "talent_weeks", label: "Core Collaborator length", def: 8, min: 1, max: 26, unit: "weeks", later: "people" },
  { key: "project_limit", label: "Active projects per person", def: 2, min: 1, max: 10, later: "people" },
  { key: "project_team_size", label: "Project team size", def: 6, min: 1, max: 20, later: "people" },
  { key: "public_hide_days", label: "Hide a stuck mission from Now building after", def: 7, min: 1, max: 60, unit: "days", later: "outcomes" },
  { key: "idea_projects_per_week", label: "Project ideas per week", def: 3, min: 0, max: 10, later: "outcomes" },
  { key: "idea_research_per_month", label: "Research topics per month", def: 3, min: 0, max: 10, later: "outcomes" },
  { key: "idea_daily_cap", label: "Idea Engine AI calls per day", def: 20, min: 0, max: 200, later: "outcomes" },
];

export const HUBS: { slug: string; label: string }[] = [
  { slug: "design-branding", label: "Design & Branding" },
  { slug: "competitions-opportunities", label: "Competitions & Opportunities" },
  { slug: "projects-research-startups", label: "Projects, Research & Startups" },
  { slug: "event-crew", label: "FusionX Event Crew" },
];
export const hubLabel = (slug: string) => (slug === "any" ? "Any hub" : HUBS.find((h) => h.slug === slug)?.label ?? slug);

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planned", active: "Active", review: "Review", done: "Done", paused: "Paused", cancelled: "Cancelled",
};
export const TASK_STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting", open: "Open", offered: "Offered", accepted: "In progress", submitted: "In review",
  changes: "Changes asked", approved: "Done", cancelled: "Cancelled",
};
export const EFFORT_LABEL: Record<string, string> = { S: "Small", M: "Medium", L: "Large" };
export const PROOF_LABEL: Record<string, string> = { link: "A link", file: "A file", image: "An image", text: "A short note" };

export const PERMISSION_TOKENS: { key: string; label: string }[] = [
  { key: "super_admin", label: "Super admin" },
  { key: "admin", label: "Admins" },
  { key: "head_of_execution", label: "Head of Execution" },
  { key: "hub_lead", label: "Hub leads" },
  { key: "mentor", label: "Mentors" },
  { key: "member", label: "Members" },
];

export type Health = "green" | "amber" | "red";
