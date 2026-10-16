/**
 * Recruitment stages: the one ordered list the timeline, the admin board,
 * filters and every "current step" read. The Postgres enum's own order is
 * never relied on.
 *
 * Candidate timeline: Applied → Shortlisted → Interview → Result → Task.
 * "Task" comes after the result: a hub's post-result task, shown only to the
 * candidates selected for that hub, once the results are out. The old "task"
 * stage before the interview is retired (migration 0021 moved any row in it
 * back to shortlisted); it stays in the type only so an old row still reads.
 *
 * Pure data: safe to import from client components.
 */

export type Stage = "applied" | "shortlisted" | "task" | "interview" | "selected" | "waitlisted" | "not_selected";

/** In order. Admin stage pickers, filters and the stage-by-hub table use this. */
export const STAGES: Stage[] = ["applied", "shortlisted", "interview", "selected", "waitlisted", "not_selected"];

export const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  task: "Task (old stage)",
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

/** Position in STAGES, for sorting (an old "task" row sorts with shortlisted). */
export function stageOrder(stage: Stage): number {
  return STAGES.indexOf(stage === "task" ? "shortlisted" : stage);
}

export const TIMELINE_STEPS = ["Applied", "Shortlisted", "Interview", "Result", "Task"] as const;

export type StepState = "done" | "current" | "upcoming" | "na";
export type TimelineStep = { label: (typeof TIMELINE_STEPS)[number]; state: StepState; note?: string };

/**
 * The five steps for one hub. `stage` is what the candidate may see:
 * "in_review" while a decision exists but the results are not out (the
 * database hides it), the decision itself after.
 *  - selected:  `taskDone` ticks the Task step; otherwise it is the current step
 *  - everyone else after the results: Task is "Not applicable"
 *  - before the results: Task waits, "After results"
 */
export function timeline({
  stage,
  resultsOut,
  taskDone = false,
}: {
  stage: Stage | "in_review" | "absent";
  resultsOut: boolean;
  taskDone?: boolean;
}): TimelineStep[] {
  const final = resultsOut && (stage === "selected" || stage === "waitlisted" || stage === "not_selected" || stage === "absent");
  const reached = final ? 3 : stage === "interview" || stage === "in_review" ? 2 : stage === "shortlisted" || stage === "task" ? 1 : 0;
  return TIMELINE_STEPS.map((label, i): TimelineStep => {
    if (i < 4) {
      // Applied is ticked as soon as it is reached; Result once it is out; the others while they last are "current".
      const state: StepState = i < reached || (i === reached && (i === 0 || final)) ? "done" : i === reached ? "current" : "upcoming";
      return { label, state };
    }
    if (!resultsOut) return { label, state: "upcoming", note: "After results" };
    if (stage === "selected") return { label, state: taskDone ? "done" : "current" };
    return { label, state: "na", note: "Not applicable" };
  });
}
