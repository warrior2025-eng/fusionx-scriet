import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { ExportButtons } from "@/components/admin/export-buttons";
import { AdminPage, EmptyRow, Pill, Table, Td, Th, Toolbar, formatDate, param, withParams, type ListParams } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { filterTeams, loadTeams } from "@/lib/teams/admin";
import { TEAM_STATUS_LABELS, TEAM_TYPE_LABELS, VERIFICATION_LABELS, VERIFICATION_TONE } from "@/lib/teams/data";

export const metadata: Metadata = { title: "Admin: FusionX Teams" };

export default async function TeamsAdminPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("moderation", "/admin/teams");
  const query = await searchParams;
  const canManage = ctx.caps.includes("teams.manage");
  const all = await loadTeams(ctx.supabase);
  const shown = filterTeams(all, {
    q: param(query, "q"),
    verification: param(query, "verification"),
    type: param(query, "type"),
    focus: param(query, "focus"),
    status: param(query, "status"),
    looking: param(query, "looking"),
    size: param(query, "size"),
  });
  const pending = all.filter((t) => t.verification_status === "pending").length;
  const focuses = [...new Set(all.map((t) => t.focus).filter((f): f is string => Boolean(f)))].sort();

  return (
    <AdminPage
      title="FusionX Teams"
      description={`Student teams registered on the site. ${pending} waiting for verification.`}
      crumbs={[{ label: "FusionX Teams" }]}
      actions={
        <>
          {canManage && (
            <LinkButton href="/admin/teams/settings" variant="secondary" size="sm">
              <Settings size={14} /> Settings
            </LinkButton>
          )}
          <ExportButtons href={withParams("/admin/teams/export", query, {})} />
        </>
      }
    >
      <Toolbar
        base="/admin/teams"
        params={query}
        searchPlaceholder="Search team, project, leader"
        filters={[
          { name: "verification", label: "Verification", options: (["pending", "verified", "rejected"] as const).map((v) => ({ value: v, label: VERIFICATION_LABELS[v] })) },
          { name: "type", label: "Type", options: (["existing", "new"] as const).map((v) => ({ value: v, label: TEAM_TYPE_LABELS[v] })) },
          { name: "focus", label: "Focus", options: focuses.map((f) => ({ value: f, label: f })) },
          { name: "status", label: "Status", options: (["forming", "active", "completed", "archived"] as const).map((s) => ({ value: s, label: TEAM_STATUS_LABELS[s] })) },
          { name: "looking", label: "Looking for members", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
          { name: "size", label: "Size", options: [{ value: "1", label: "1 member" }, { value: "2-3", label: "2 to 3" }, { value: "4+", label: "4 or more" }] },
        ]}
      />

      <Table label="Teams">
        <thead>
          <tr>
            <Th>Team</Th>
            <Th>Leader</Th>
            <Th>Type</Th>
            <Th>Focus</Th>
            <Th>Members</Th>
            <Th>Verification</Th>
            <Th>Status</Th>
            <Th>Registered</Th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && <EmptyRow colSpan={8}>{all.length === 0 ? "No teams have registered yet." : "No team matches these filters."}</EmptyRow>}
          {shown.map((team) => (
            <tr key={team.id}>
              <Td className="font-medium text-ink">
                <Link href={`/admin/teams/${team.id}`} className="underline underline-offset-2">
                  {team.name}
                </Link>
                {team.is_featured && (
                  <span className="ml-2">
                    <Pill tone="good">Featured</Pill>
                  </span>
                )}
              </Td>
              <Td>{team.leader}</Td>
              <Td>{TEAM_TYPE_LABELS[team.team_type]}</Td>
              <Td>{team.focus}</Td>
              <Td className="tabular-nums">
                {team.size}
                {team.max_size ? ` of ${team.max_size}` : ""}
              </Td>
              <Td>
                <Pill tone={VERIFICATION_TONE[team.verification_status]}>{VERIFICATION_LABELS[team.verification_status]}</Pill>
              </Td>
              <Td>{TEAM_STATUS_LABELS[team.status]}</Td>
              <Td className="whitespace-nowrap">{formatDate(team.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
