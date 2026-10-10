import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
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
  withParams,
  type ListParams,
} from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { filterUsers, listUsers, type AdminUser } from "@/lib/admin/users";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/permissions/capabilities";

export const metadata: Metadata = { title: "Admin: Users" };

const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("users", "/admin/users");
  const params = await searchParams;

  let users: AdminUser[] = [];
  let failed = false;
  try {
    users = filterUsers(await listUsers(ctx), {
      q: param(params, "q"),
      role: param(params, "role"),
      state: param(params, "state"),
    });
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const page = pageOf(params);
  const shown = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AdminPage
      title="Users & roles"
      description="Every account on the site. Roles are granted by a super admin from a user's page."
      crumbs={[{ label: "Users & roles" }]}
      actions={
        <LinkButton href={withParams("/admin/users/export", params, { page: undefined })} variant="secondary" size="sm">
          <Download size={14} /> Export CSV
        </LinkButton>
      }
    >
      <Toolbar
        base="/admin/users"
        params={params}
        searchPlaceholder="Search name, email, department"
        filters={[
          { name: "role", label: "Role", options: ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
          {
            name: "state",
            label: "Account",
            options: [
              { value: "active", label: "Active" },
              { value: "deactivated", label: "Deactivated" },
              { value: "unverified", label: "Email not verified" },
            ],
          },
        ]}
      />

      {failed && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          The account list could not be loaded. Check that SUPABASE_SERVICE_ROLE_KEY is set on the server.
        </p>
      )}

      <Table label="Users">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Department</Th>
            <Th>Year</Th>
            <Th>Joined</Th>
            <Th>Roles</Th>
            <Th>Account</Th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && <EmptyRow colSpan={7}>No accounts match.</EmptyRow>}
          {shown.map((user) => (
            <tr key={user.id}>
              <Td className="font-medium text-ink">
                <Link href={`/admin/users/${user.id}`} className="hover:underline">
                  {user.fullName}
                </Link>
              </Td>
              <Td className="break-all">{user.email}</Td>
              <Td>{user.department}</Td>
              <Td>{user.year}</Td>
              <Td className="whitespace-nowrap">{formatDate(user.joinedAt)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Pill key={role} tone={role === "member" ? "neutral" : "good"}>
                      {ROLE_LABELS[role]}
                    </Pill>
                  ))}
                </div>
              </Td>
              <Td>
                {!user.isActive ? (
                  <Pill tone="bad">Deactivated</Pill>
                ) : !user.emailConfirmed ? (
                  <Pill tone="warn">Unverified</Pill>
                ) : (
                  <Pill>Active</Pill>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base="/admin/users" params={params} page={page} pageSize={PAGE_SIZE} total={users.length} />
    </AdminPage>
  );
}
