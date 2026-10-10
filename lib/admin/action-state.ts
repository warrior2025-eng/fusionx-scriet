/** What every admin server action returns to the form or button that called it. */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Public page where the change can be seen ("View on site"). */
  viewHref?: string;
  /** Where the admin UI should go next (e.g. back to the list after a create). */
  redirectTo?: string;
};

export const IDLE: ActionState = { status: "idle" };

export const ok = (message: string, extra: Partial<ActionState> = {}): ActionState => ({
  status: "success",
  message,
  ...extra,
});

export const fail = (message: string, fieldErrors?: Record<string, string>): ActionState => ({
  status: "error",
  message,
  fieldErrors,
});

/** First message per field from a Zod error, keyed by the field's dotted path. */
export function zodFieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
