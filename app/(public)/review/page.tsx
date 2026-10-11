import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill, Table, Td, Th, EmptyRow, formatDate } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { STAGE_LABELS, STAGE_TONE, type Stage } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Review applications", robots: { index: false } };

/**
 * For team reviewers: the applications that list a team they review. The
 * database returns nothing else to them, so this page has no checks of its
 * own beyond "are you signed in".
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review");
  const { team: wanted } = await searchParams;

  const { data: assigned } = await supabase.from("recruitment_team_reviewers").select("team_id").eq("user_id", user.id);
  const teamIds = (assigned ?? []).map((a) => a.team_id as string);
  const { data: teamRows } = teamIds.length
    ? await supabase.from("recruitment_teams").select("id, name, seats, cycle_id").in("id", teamIds).order("name")
    : { data: [] };
  const teams = (teamRows ?? []) as { id: string; name: string; seats: number | null; cycle_id: string }[];
  const team = teams.find((t) => t.id === wanted) ?? teams[0];

  const { data: statusRows } = team
    ? await supabase.from("recruitment_team_status").select("application_id, rank, stage, stage_updated_at").eq("team_id", team.id)
    : { data: [] };
  const statuses = (statusRows ?? []) as { application_id: string; rank: number; stage: Stage; stage_updated_at: string }[];
  const ids = statuses.map((s) => s.application_id);
  const [{ data: applicationRows }, { data: reviewRows }] = await Promise.all([
    ids.length
      ? supabase.from("recruitment_applications").select("id, full_name, department, year, submitted_at").in("id", ids)
      : Promise.resolve({ data: [] }),
    team ? supabase.from("recruitment_reviews").select("application_id, reviewer_id, score").eq("team_id", team.id) : Promise.resolve({ data: [] }),
  ]);
  const applications = Object.fromEntries((applicationRows ?? []).map((a) => [a.id as string, a]));
  const reviews = (reviewRows ?? []) as { application_id: string; reviewer_id: string; score: number | null }[];
  const list = statuses
    .filter((s) => applications[s.application_id])
    .sort((a, b) => String(applications[a.application_id].full_name).localeCompare(String(applications[b.application_id].full_name)));
  const selected = statuses.filter((s) => s.stage === "selected").length;

  return (
    <Section className="pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Review applications</h1>

      {teams.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="You are not a reviewer for any team." description="An admin assigns reviewers to each recruitment team." />
        </div>
      ) : (
        <>
          {teams.length > 1 && (
            <nav aria-label="Teams you review" className="mt-6 flex flex-wrap gap-2">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  href={`/review?team=${t.id}`}
                  aria-current={t.id === team.id ? "page" : undefined}
                  className={cn("border px-3 py-1.5 text-sm", t.id === team.id ? "border-accent bg-accent-soft text-ink" : "border-ink/25 text-ink/75 hover:border-ink/60")}
                >
                  {t.name}
                </Link>
              ))}
            </nav>
          )}
          <p className="mb-4 mt-6 text-sm text-ink/70">
            {team.name}: {list.length} application{list.length === 1 ? "" : "s"}
            {team.seats !== null && `, ${selected} of ${team.seats} seat${team.seats === 1 ? "" : "s"} filled`}
          </p>
          <Table label={`Applications for ${team.name}`}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Year</Th>
                <Th>Choice</Th>
                <Th>Stage</Th>
                <Th>Your score</Th>
                <Th>Average</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <EmptyRow colSpan={8}>No applications for this team yet.</EmptyRow>}
              {list.map((s) => {
                const a = applications[s.application_id];
                const scored = reviews.filter((r) => r.application_id === s.application_id && r.score !== null);
                const mine = scored.find((r) => r.reviewer_id === user.id);
                return (
                  <tr key={s.application_id}>
                    <Td className="font-medium text-ink">
                      <Link href={`/review/${s.application_id}`} className="underline underline-offset-2">
                        {a.full_name as string}
                      </Link>
                    </Td>
                    <Td>{a.department as string}</Td>
                    <Td>{a.year as string}</Td>
                    <Td className="tabular-nums">{s.rank}</Td>
                    <Td>
                      <Pill tone={STAGE_TONE[s.stage]}>{STAGE_LABELS[s.stage]}</Pill>
                    </Td>
                    <Td className="tabular-nums">{mine?.score ?? ""}</Td>
                    <Td className="tabular-nums">
                      {scored.length ? (scored.reduce((sum, r) => sum + (r.score as number), 0) / scored.length).toFixed(1) : ""}
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(a.submitted_at as string)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}
    </Section>
  );
}
