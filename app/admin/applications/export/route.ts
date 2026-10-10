import { applicationsQuery } from "@/lib/admin/applications";
import { logAudit } from "@/lib/admin/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { authorize } from "@/lib/admin/guard";
import type { Application } from "@/types/database";

export async function GET(request: Request) {
  const ctx = await authorize("applications");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const q = new URL(request.url).searchParams;
  const { data } = await applicationsQuery(ctx, {
    q: q.get("q") ?? "",
    status: q.get("status") ?? "",
    department: q.get("department") ?? "",
    from: q.get("from") ?? "",
    to: q.get("to") ?? "",
  }).limit(5000);
  const rows = (data ?? []) as unknown as Application[];

  await logAudit(ctx, { action: "exported", table: "applications", note: `${rows.length} applications to CSV` });

  return csvResponse(
    "fusionx-applications",
    toCsv(rows, [
      { header: "Name", value: (a) => a.full_name },
      { header: "College email", value: (a) => a.college_email },
      { header: "Department", value: (a) => a.department },
      { header: "Year", value: (a) => a.year },
      { header: "Preferred area", value: (a) => a.preferred_functional_area },
      { header: "Skills", value: (a) => a.skills },
      { header: "Interests", value: (a) => a.interests },
      { header: "Motivation", value: (a) => a.motivation },
      { header: "Project interests", value: (a) => a.project_interests },
      { header: "Research interests", value: (a) => a.research_interests },
      { header: "Portfolio", value: (a) => a.portfolio_url },
      { header: "GitHub", value: (a) => a.github_url },
      { header: "LinkedIn", value: (a) => a.linkedin_url },
      { header: "Status", value: (a) => a.status },
      { header: "Review note", value: (a) => a.review_notes },
      { header: "Received", value: (a) => a.created_at?.slice(0, 10) },
    ]),
  );
}
