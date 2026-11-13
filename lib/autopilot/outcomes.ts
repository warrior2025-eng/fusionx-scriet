/**
 * Outcomes helpers (migration 0044). Semesters: January–June and July–December, as at SCRIET.
 */

export function semesterStart(today = new Date()): string {
  const d = new Date(today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  return `${d.getFullYear()}-${d.getMonth() < 6 ? "01" : "07"}-01`;
}

export function semesterLabel(today = new Date()): string {
  const d = new Date(today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  return d.getMonth() < 6 ? `January–June ${d.getFullYear()}` : `July–December ${d.getFullYear()}`;
}

export function semesterEnd(today = new Date()): string {
  const d = new Date(today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  return `${d.getFullYear()}-${d.getMonth() < 6 ? "06-30" : "12-31"}`;
}

/** Public pages counted by the beacon; admin, meetings, interviews and member pages are not. */
export function visitGroup(pathname: string): string | null {
  if (/^\/(admin|command|my-work|meetings|interview|review|profile|projects\/[^/]+\/(edit|work)|faculty|check-in|login|signup|auth|api|print)(\/|$)/.test(pathname)) return null;
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1] ?? "";
  return /^[a-z-]{1,30}$/.test(first) ? first : "other";
}
