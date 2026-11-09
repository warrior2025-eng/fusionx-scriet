import { pdfResponse } from "@/lib/admin/export";
import { createClient } from "@/lib/supabase/server";

/** The signed-in member's verified contributions as a PDF (only approved, reviewed work). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Please sign in.", { status: 401 });
  const [{ data: profile }, { data }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("contributions").select("title, skill, contributed_on, mission:missions(title), reviewer_id")
      .eq("user_id", auth.user.id).eq("counts", true).order("contributed_on", { ascending: false }),
  ]);
  type Row = { title: string; skill: string | null; contributed_on: string; mission: { title: string } | null; reviewer_id: string | null };
  const rows = (data ?? []) as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.reviewer_id).filter((x): x is string => !!x))];
  const { data: reviewers } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((reviewers ?? []).map((p) => [p.id as string, p.full_name as string]));
  return pdfResponse({
    filename: "fusionx-contributions",
    title: `FusionX contributions: ${profile?.full_name ?? "Member"}`,
    filters: { "Verified": "every entry was reviewed and approved by a teammate or lead", "Entries": String(rows.length) },
    rows,
    columns: [
      { header: "Date", value: (r) => r.contributed_on },
      { header: "Contribution", value: (r) => r.title },
      { header: "Mission", value: (r) => r.mission?.title ?? "" },
      { header: "Skill", value: (r) => r.skill ?? "" },
      { header: "Reviewed by", value: (r) => names.get(r.reviewer_id ?? "") ?? "" },
    ],
  });
}
