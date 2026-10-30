import { authorize } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { exportFormat, exportResponse } from "@/lib/admin/export";
import { filterUsers, listUsers } from "@/lib/admin/users";
import { ROLE_LABELS } from "@/lib/permissions/capabilities";
import type { AppRole } from "@/types/database";

export async function GET(request: Request) {
  const ctx = await authorize("users");
  if (!ctx) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const format = exportFormat(url);
  const users = filterUsers(await listUsers(ctx), {
    q: url.searchParams.get("q") ?? "",
    role: url.searchParams.get("role") ?? "",
    state: url.searchParams.get("state") ?? "",
  });

  await logAudit(ctx, { action: "exported", table: "profiles", note: `${users.length} users to ${format.toUpperCase()}` });

  const role = url.searchParams.get("role") ?? "";
  return exportResponse(format, {
    filename: "fusionx-users",
    title: "Users and roles",
    filters: {
      Search: url.searchParams.get("q"),
      Role: role ? (ROLE_LABELS[role as AppRole] ?? role) : "",
      Account: url.searchParams.get("state"),
    },
    rows: users,
    columns: [
      { header: "Name", value: (u) => u.fullName },
      { header: "Email", value: (u) => u.email },
      { header: "Email verified", value: (u) => (u.emailConfirmed ? "Yes" : "No") },
      { header: "Department", value: (u) => u.department },
      { header: "Year", value: (u) => u.year },
      { header: "Joined", value: (u) => u.joinedAt?.slice(0, 10) },
      { header: "Roles", value: (u) => u.roles.map((r) => ROLE_LABELS[r]) },
      { header: "Account", value: (u) => (u.isActive ? "Active" : "Deactivated") },
    ],
  });
}
