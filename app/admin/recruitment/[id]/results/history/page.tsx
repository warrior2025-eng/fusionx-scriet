import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, EmptyRow, Panel, Table, Td, Th, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { istDateTime } from "@/lib/events/format";
import { DECISION_LABELS } from "@/lib/recruitment/results";

export const metadata: Metadata = { title: "Admin: Decision history" };

const SOURCES: Record<string, string> = {
  board: "Saved on the board",
  bulk: "Bulk decision",
  move: "Moved to another hub",
  one_hub: "One-hub rule",
  absent: "Absent rule",
  promote: "Promoted from the waitlist",
  select_another: "Selected in another hub",
  correction: "Correction",
  offer: "Candidate's answer",
  expired: "Offer expired",
  removed: "Removed from the waitlist",
  review: "Review screen",
};
const label = (decision: string | null) => (decision === null ? "None" : (DECISION_LABELS[decision as keyof typeof DECISION_LABELS] ?? decision));

type Entry = { id: string; team_id: string; from_decision: string | null; to_decision: string; by_user: string | null; at: string; source: string; origin_team_id: string | null };

/** Every change to one candidate's decisions, newest first, written by the database itself. */
export default async function DecisionHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ListParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const appId = param(query, "app");
  if (!/^[0-9a-f-]{36}$/i.test(appId)) notFound();
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}/results`);
  const [{ data: app }, { data: teams }, { data: log }] = await Promise.all([
    ctx.supabase.from("recruitment_applications").select("full_name").eq("id", appId).eq("cycle_id", id).maybeSingle(),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id),
    ctx.supabase.from("recruitment_decision_log").select("*").eq("application_id", appId).order("at", { ascending: false }).limit(200),
  ]);
  if (!app) notFound();
  const entries = (log ?? []) as Entry[];
  const hub = new Map(((teams ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const by = [...new Set(entries.flatMap((e) => (e.by_user ? [e.by_user] : [])))];
  const { data: names } = by.length ? await ctx.supabase.from("profiles").select("id, full_name").in("id", by) : { data: [] };
  const person = new Map(((names ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  return (
    <AdminPage
      title={`History: ${app.full_name ?? "Candidate"}`}
      crumbs={[
        { label: "Recruitment", href: "/admin/recruitment" },
        { label: "Results", href: `/admin/recruitment/${id}/results` },
        { label: "History" },
      ]}
    >
      <Panel>
        <Table label="Decision history">
          <thead>
            <tr>
              <Th>When (IST)</Th>
              <Th>Hub</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th>How</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <EmptyRow colSpan={6}>No changes recorded yet.</EmptyRow>}
            {entries.map((e) => (
              <tr key={e.id} data-history={e.source}>
                <Td className="whitespace-nowrap">{istDateTime(e.at)}</Td>
                <Td>{hub.get(e.team_id) ?? ""}</Td>
                <Td>{label(e.from_decision)}</Td>
                <Td className="font-medium text-ink">{label(e.to_decision)}</Td>
                <Td>
                  {SOURCES[e.source] ?? e.source}
                  {e.origin_team_id && <span className="block text-xs text-ink/60">By a change in {hub.get(e.origin_team_id) ?? "another hub"}</span>}
                </Td>
                <Td>{e.by_user ? (person.get(e.by_user) ?? "An admin") : "The system"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </AdminPage>
  );
}
