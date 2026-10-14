/**
 * Recruitment: the shapes, labels and small pure helpers the pages share.
 * Nothing here touches the database, so client components may import it.
 */

export type CycleStatus = "draft" | "open" | "closed" | "results_published";
export type QuestionType = "short_text" | "long_text" | "url" | "single_choice" | "multi_choice" | "file";
export type ApplicationStatus = "draft" | "submitted" | "withdrawn";
export type Stage = "applied" | "shortlisted" | "task" | "interview" | "selected" | "waitlisted" | "not_selected";

import { resultsVisible, type CycleResults } from "./results";

export type Cycle = CycleResults & {
  id: string;
  title: string;
  description: string | null;
  opens_at: string | null;
  closes_at: string | null;
  status: CycleStatus;
  max_preferences: number;
  allowed_years: string[];
  allowed_departments: string[];
  created_at: string;
  /** Interview slots (migration 0016); absent before it is run. */
  slot_required?: boolean;
  cutoff_hours?: number;
  interview_instructions?: string;
  reporting_note?: string | null;
};

export type RecruitmentTeam = {
  id: string;
  cycle_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  responsibilities: string | null;
  what_we_look_for: string | null;
  seats: number | null;
  emoji: string | null;
  image_path: string | null;
  display_order: number;
  is_visible: boolean;
  accepting_applications: boolean;
};

export type Question = {
  id: string;
  cycle_id: string;
  team_id: string | null;
  label: string;
  help_text: string | null;
  type: QuestionType;
  options: string[];
  required: boolean;
  max_length: number | null;
  display_order: number;
};

export type Answer = string | string[];

export type Application = {
  id: string;
  cycle_id: string;
  user_id: string;
  full_name: string | null;
  department: string | null;
  year: string | null;
  preferences: string[];
  answers: Record<string, Answer>;
  links: Record<string, string>;
  resume_path: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
};

export const STAGES: Stage[] = ["applied", "shortlisted", "task", "interview", "selected", "waitlisted", "not_selected"];
export const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  task: "Task",
  interview: "Interview",
  selected: "Selected",
  waitlisted: "Waitlisted",
  not_selected: "Not selected",
};
export const FINAL_STAGES: Stage[] = ["selected", "waitlisted", "not_selected"];
export const STAGE_TONE: Record<Stage, "neutral" | "good" | "warn" | "bad"> = {
  applied: "neutral",
  shortlisted: "neutral",
  task: "neutral",
  interview: "warn",
  selected: "good",
  waitlisted: "warn",
  not_selected: "bad",
};

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  results_published: "Results published",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short answer",
  long_text: "Long answer",
  url: "Link",
  single_choice: "Choose one",
  multi_choice: "Choose several",
  file: "PDF upload",
};

/** What a visitor is told about a cycle right now. */
export type CycleState = "none" | "upcoming" | "open" | "closed" | "results";

export function cycleState(cycle: Cycle | null, now = Date.now()): CycleState {
  if (!cycle || cycle.status === "draft") return "none";
  if (resultsVisible(cycle, now)) return "results";
  if (cycle.status === "closed") return "closed";
  if (cycle.opens_at && now < new Date(cycle.opens_at).getTime()) return "upcoming";
  if (cycle.closes_at && now >= new Date(cycle.closes_at).getTime()) return "closed";
  return "open";
}

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

export function toQuestion(row: Record<string, unknown>): Question {
  return { ...(row as unknown as Question), options: asStrings(row.options) };
}

export function toApplication(row: Record<string, unknown>): Application {
  return {
    ...(row as unknown as Application),
    preferences: asStrings(row.preferences),
    answers: (row.answers && typeof row.answers === "object" ? row.answers : {}) as Record<string, Answer>,
    links: (row.links && typeof row.links === "object" ? row.links : {}) as Record<string, string>,
  };
}

/** The questions an application with these preferences has to answer, in order. */
export function questionsFor(questions: Question[], preferences: string[]): Question[] {
  const common = questions.filter((q) => q.team_id === null);
  const perTeam = preferences.flatMap((teamId) => questions.filter((q) => q.team_id === teamId));
  return [...common, ...perTeam];
}

/** An answer as text, for the review screens and the export. */
export function answerText(answer: Answer | undefined): string {
  if (answer === undefined || answer === null) return "";
  return Array.isArray(answer) ? answer.join(", ") : String(answer);
}

/** A database error as something to show: its own message unless it is an internal one. */
export function friendlyDbError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/^[A-Z_]+$/.test(message.trim())) return "You don't have permission to do this.";
  if (/violates|permission denied|does not exist|syntax|invalid input|schema cache|JWT/i.test(message)) return fallback;
  return message;
}
