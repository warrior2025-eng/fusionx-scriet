import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions";
import { getCandidateEntry } from "@/lib/recruitment/my-entry";

/**
 * /interview: one short link for candidates. The interview room while its join window is open, else the status
 * page (slot time, countdown, and the result once it is out). Signed out: sign in first, then back here.
 * A route (not a page), so the redirect is immediate.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/interview", request.url));
  const entry = await getCandidateEntry();
  return NextResponse.redirect(new URL(entry?.href ?? "/recruitment/status", request.url));
}
