import type { Metadata } from "next";
import { AdminPage, EmptyRow, Pagination, Table, Td, Th, Toolbar, formatDate, pageOf, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { AuditLog } from "@/types/database";

export const metadata: Metadata = { title: "Admin: Audit log" };

const PAGE_SIZE = 30;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const show = (value: unknown): string =>
  value === null || value === undefined || value === ""
    ? "empty"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

/** The changed fields of an entry, as "field: before -> after" lines. */
function Changes({ metadata }: { metadata: AuditLog["metadata"] }) {
  if (!metadata) return null;
  const before = metadata.before ?? {};
  const after = metadata.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return (
    <div className="space-y-1">
      {metadata.note && <p className="text-xs text-ink/75">{metadata.note}</p>}
      {keys.length > 0 && (
        <dl className="space-y-1 text-xs">
          {keys.slice(0, 8).map((key) => (
            <div key={key} className="break-words">
              <dt className="inline font-medium text-ink">{key.replace(/_/g, " ")}: </dt>
              <dd className="inline text-ink/75">
                {metadata.before && metadata.after ? (
                  <>
                    <span className="text-ink/55 line-through">{show(before[key])}</span>{" "}
                    <span aria-hidden>to</span> <span>{show(after[key])}</span>
                  </>
                ) : (
                  show(metadata.after ? after[key] : before[key])
                )}
              </dd>
            </div>
          ))}
          {keys.length > 8 && <p className="text-ink/55">and {keys.length - 8} more fields</p>}
        </dl>
      )}
    </div>
  );
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("audit", "/admin/audit-logs");
  const params = await searchParams;
  const page = pageOf(params);
  const user = param(params, "user");
  const table = param(params, "table");
  const action = param(params, "action");
  const from = param(params, "from");
  const to = param(params, "to");

  // Filter options: the staff who can appear, and the tables and actions seen recently.
  const [{ data: staffRoles }, { data: recent }] = await Promise.all([
    ctx.supabase.from("user_roles").select("user_id").in("role", ["super_admin", "admin", "editor"]),
    ctx.supabase.from("audit_logs").select("resource_type, action").order("created_at", { ascending: false }).limit(500),
  ]);
  const staffIds = [...new Set((staffRoles ?? []).map((r) => r.user_id as string))];
  const tables = [...new Set((recent ?? []).map((r) => r.resource_type as string))].sort();
  const actions = [...new Set((recent ?? []).map((r) => r.action as string))].sort();

  let query = ctx.supabase.from("audit_logs").select("*", { count: "exact" });
  if (user) query = query.eq("user_id", user);
  if (table) query = query.eq("resource_type", table);
  if (action) query = query.eq("action", action);
  if (isDate(from)) query = query.gte("created_at", `${from}T00:00:00+05:30`);
  if (isDate(to)) query = query.lte("created_at", `${to}T23:59:59+05:30`);
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const logs = (data ?? []) as AuditLog[];

  const nameIds = [...new Set([...staffIds, ...logs.map((l) => l.user_id).filter(Boolean)])] as string[];
  const { data: profiles } = nameIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name").in("id", nameIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <AdminPage
      title="Audit log"
      description="Every change made from the admin panel: who made it, to what, and what changed."
      crumbs={[{ label: "Audit log" }]}
    >
      <Toolbar
        base="/admin/audit-logs"
        params={params}
        searchPlaceholder={null}
        dateRange
        filters={[
          { name: "user", label: "User", options: staffIds.map((id) => ({ value: id, label: nameOf.get(id) ?? "Unknown" })) },
          { name: "table", label: "Table", options: tables.map((t) => ({ value: t, label: t.replace(/_/g, " ") })) },
          { name: "action", label: "Action", options: actions.map((a) => ({ value: a, label: a.replace(/_/g, " ") })) },
        ]}
      />
      <Table label="Audit log">
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Table</Th>
            <Th>Changes</Th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && <EmptyRow colSpan={5}>No entries match.</EmptyRow>}
          {logs.map((log) => (
            <tr key={log.id}>
              <Td className="whitespace-nowrap align-top">{formatDate(log.created_at, true)}</Td>
              <Td className="align-top">{log.user_id ? (nameOf.get(log.user_id) ?? "Unknown") : "System"}</Td>
              <Td className="align-top font-medium text-ink">{log.action.replace(/_/g, " ")}</Td>
              <Td className="align-top">
                {log.resource_type.replace(/_/g, " ")}
                {log.resource_id && <span className="block break-all text-xs text-ink/50">{log.resource_id}</span>}
              </Td>
              <Td className="max-w-md align-top">
                <Changes metadata={log.metadata} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination base="/admin/audit-logs" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </AdminPage>
  );
}
