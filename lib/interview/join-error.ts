/**
 * What to tell someone when the video call cannot start. Daily reports the
 * reason as text (e.g. "account-missing-payment-method"); the panel and the
 * candidate get a plain sentence instead.
 */
export function joinErrorText(error: unknown, who: "panel" | "candidate"): string {
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "")).toLowerCase();
  if (raw.includes("payment")) {
    return who === "panel"
      ? "The video service (Daily) needs a payment method on its account before calls can start. Until then, use Google Meet for this day."
      : "The interview room is not available right now. Please wait: the panel will move your interview to Google Meet.";
  }
  if (raw.includes("exp") || raw.includes("nbf") || raw.includes("token")) {
    return "This room is not open right now (it opens shortly before the slot and closes after it).";
  }
  return who === "panel"
    ? "Could not connect to the call. Check the internet connection and try again."
    : "Could not connect to the call. Check your internet connection and press Join again.";
}
