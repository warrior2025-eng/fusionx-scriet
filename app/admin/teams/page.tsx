import type { Metadata } from "next";
import { X } from "lucide-react";
import { removeTeamMember, setTeamStatus } from "@/actions/admin-moderation";
import { ActionButton } from "@/components/admin/action-button";
import {
  AdminPage,
  EmptyRow,
  Pagination,
  Pill,
  Table,
  Td,
  Th,
  Toolbar,
  formatDate,
  pageOf,
  param,
  searchFilter,
  type ListParams,
} from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { TeamStatus } from "@/types/database";

export const metadata: Metadata = { title: "Admin: Project teams" };

const PAGE_SIZE = 15;
const STATUSES: { value: TeamStatus; label: string }[] = [
  { value: "forming", label: "Forming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export default async function TeamsModerationPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("moderation", "/admin/teams");
  const params = await searchParams;
  const page = pageOf(params);
  const q = param(params, "q");
  const status = param(params, "status");

  let query = ctx.supabase.from("teams").select("id, name, description, status, created_by, created_at", { count: "exact" });
  if (q) query = query.or(searchFilter(["name", "description"], q));
  if (status) query = query.eq("status", status);
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const teams = data ?? [];

  const teamIds = teams.map((t) => t.id as string);
  const { data: memberRows } = teamIds.length
    ? await ctx.supabase.from("team_members").select("team_id, user_id, role").in("team_id", teamIds)
    : { data: [] as { team_id: string; user_id: string; role: string }[] };
  const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id))];
  const { data: profiles } = userIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <AdminPage
      title="Project teams"
      description="Teams members have formed. A completed or archived team no longer accepts new members."
      crumbs={[{ label: "Project teams" }]}
    >
      <Toolbar
        base="/admin/teams"
        params={params}
        searchPlaceholder="Search teams"
        filters={[{ name: "status", label: "Status", options: STATUSES }]}
      />
      <Table label="Project teams">
        <thead>
          <tr>
            <Th>Team</Th>
            <Th>Members</Th>
            <Th>Created</Th>
            <Th>Status</Th>
            <Th className="text-right">Set status</Th>
          </tr>
        </thead>
        <tbody>
          {teams.length === 0 && <EmptyRow colSpan={5}>No teams match.</EmptyRow>}
          {teams.map((team) => {
            const members = (memberRows ?? []).filter((m) => m.team_id === team.id);
            return (
              <tr key={team.id}>
                <Td className="align-top">
                  <span className="font-medium text-ink">{team.name}</span>
                  {team.description && <span className="mt-1 block max-w-xs text-xs text-ink/60">{team.description}</span>}
                </Td>
                <Td className="align-top">
                  {members.length === 0 ? (
                    <span className="text-ink/50">No members</span>
                  ) : (
                    <ul className="space-y-1">
                      {members.map((member) => {
                        const name = nameOf.get(member.user_id) ?? "Unknown";
                        return (
                          <li key={member.user_id} className="flex items-center gap-1.5">
                            <span>{name}</span>
                            {member.role === "lead" && <Pill>Lead</Pill>}
                            <ActionButton
                              bare
                              danger
                              className="h-6 w-6"
                              title={`Remove ${name} from ${team.name}`}
                              action={removeTeamMember.bind(null, team.id, member.user_id)}
                              confirm={{
                                title: "Remove this member?",
                                body: `${name} will be removed from ${team.name}.`,
                                confirmLabel: "Remove",
                              }}
                            >
                              <X size={13} />
                            </ActionButton>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Td>
                <Td className="whitespace-nowrap align-top">{formatDate(team.created_at)}</Td>
                <Td className="align-top">
                  <Pill tone={team.status === "active" || team.status === "forming" ? "good" : "neutral"}>{team.status}</Pill>
                </Td>
                <Td className="align-top">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {STATUSES.filter((s) => s.value !== team.status).map((s) => (
                      <ActionButton key={s.value} variant="ghost" action={setTeamStatus.bind(null, team.id, s.value)}>
                        {s.label}
                      </ActionButton>
                    ))}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination base="/admin/teams" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </AdminPage>
  );
}
