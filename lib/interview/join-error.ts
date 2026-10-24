/**
 * What to tell someone when the video call cannot start or drops. The video
 * service reports a technical reason; the panel and the candidate get a plain
 * sentence instead.
 */
export function joinErrorText(error: unknown, who: "panel" | "candidate"): string {
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "")).toLowerCase();
  if (raw.includes("quota") || raw.includes("limit") || raw.includes("payment")) {
    return who === "panel"
      ? "The video service has reached its free limit for this month. Use Google Meet for this day."
      : "The interview room is not available right now. Please stay on this page: the panel will tell you how to continue.";
  }
  if (raw.includes("expired") || raw.includes("not valid yet") || raw.includes("nbf") || raw.includes("401") || raw.includes("unauthorized")) {
    return "This room is not open right now (it opens shortly before the slot and closes after it).";
  }
  return who === "panel"
    ? "Could not connect to the call. Check the internet connection and try again."
    : "Could not connect to the call. Check your internet connection and press Rejoin.";
}
