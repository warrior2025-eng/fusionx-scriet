import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getCandidateEntry } from "@/lib/recruitment/my-entry";

/**
 * /interview: one short link for candidates. The interview room while its join window is open, else the status
 * page (slot time, countdown, and the result once it is out). Signed out: sign in first, then back here.
 */
export default async function InterviewShortLink() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/interview");
  const entry = await getCandidateEntry();
  redirect(entry?.href ?? "/recruitment/status");
}
