import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteEntity, moveEntity, saveEntity, setEntityPublished } from "@/actions/admin-entities";
import { LinkButton } from "@/components/ui/button";
import { requireCapability } from "@/lib/admin/guard";
import { getEntity, isPublished, publishLabel, type EntityDef, type EntityKey } from "@/lib/admin/entities";
import { ActionButton } from "./action-button";
import { AdminForm, EntityFields } from "./admin-form";
import {
  AdminPage,
  EmptyRow,
  Pagination,
  Panel,
  Pill,
  Table,
  Td,
  Th,
  Toolbar,
  pageOf,
  param,
  searchFilter,
  type ListParams,
} from "./ui";

type Row = Record<string, unknown>;
const PAGE_SIZE = 20;

function definition(key: EntityKey): EntityDef {
  const def = getEntity(key);
  if (!def) notFound();
  return def;
}

/**
 * The list page for one content type: search, status filter, sorting,
 * pagination, and per-row edit / publish / reorder / delete. Grouped,
 * reorderable types (the Team) are shown in full, in order, under group
 * headings instead of being paginated.
 */
export async function EntityListPage({
  entity,
  searchParams,
  description,
  extraActions,
  rowLinks,
}: {
  entity: EntityKey;
  searchParams: Promise<ListParams>;
  description?: string;
  extraActions?: React.ReactNode;
  /** Extra per-row links, e.g. an event's registrations. */
  rowLinks?: (row: Row) => { href: string; label: string }[];
}) {
  const def = definition(entity);
  const ctx = await requireCapability(def.cap, def.adminPath);
  const params = await searchParams;

  const q = param(params, "q");
  const status = param(params, "status");
  const page = pageOf(params);
  const sortable = !def.orderable;
  const sortColumn = sortable && param(params, "sort") ? param(params, "sort") : def.defaultSort.column;
  const ascending = sortable && param(params, "dir") ? param(params, "dir") === "asc" : def.defaultSort.ascending;
  const allowedSorts = [def.titleColumn, def.defaultSort.column, "created_at"];

  let query = ctx.supabase.from(def.table).select("*", { count: "exact" });
  if (q) query = query.or(searchFilter(def.searchColumns, q));
  if (status) {
    if (def.publish.kind === "status") query = query.eq("status", status);
    else query = query.eq(def.publish.column, status === "on");
  }
  if (def.group) query = query.order(def.group.column, { ascending: true });
  query = query.order(allowedSorts.includes(sortColumn) ? sortColumn : def.defaultSort.column, { ascending });
  if (def.orderable) query = query.order("created_at", { ascending: true });
  else query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as Row[];

  const statusOptions =
    def.publish.kind === "status"
      ? [
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ]
      : [
          { value: "on", label: def.publish.on },
          { value: "off", label: def.publish.off },
        ];

  const canDeletePublished = def.deleteRule === "cap" || ctx.caps.includes("content.delete_published");
  const filtered = Boolean(q || status);
  const colCount = def.listColumns.length + 3;
  const sort = (column: string) => (sortable ? { base: def.adminPath, params, column, current: sortColumn, ascending } : undefined);

  // Position of each row within its group, for the up / down controls.
  const groupOf = (row: Row) => (def.group ? String(row[def.group.column]) : "");
  const groupSizes = new Map<string, number>();
  for (const row of rows) groupSizes.set(groupOf(row), (groupSizes.get(groupOf(row)) ?? 0) + 1);
  const seen = new Map<string, number>();

  return (
    <AdminPage
      title={def.plural}
      description={description}
      crumbs={[{ label: def.plural }]}
      actions={
        <>
          {extraActions}
          <LinkButton href={`${def.adminPath}/new`} size="sm">
            <Plus size={15} /> New {def.singular.toLowerCase()}
          </LinkButton>
        </>
      }
    >
      <Toolbar
        base={def.adminPath}
        params={params}
        searchPlaceholder={`Search ${def.plural.toLowerCase()}`}
        filters={[{ name: "status", label: "Status", options: statusOptions }]}
      />

      {error && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          This list could not be loaded. If the database migration for the new admin panel has not been run yet, run it
          and reload.
        </p>
      )}

      <Table label={def.plural}>
        <thead>
          <tr>
            <Th sort={sort(def.titleColumn)}>{def.singular}</Th>
            {def.listColumns.map((column) => (
              <Th key={column.label}>{column.label}</Th>
            ))}
            <Th>Visibility</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <EmptyRow colSpan={colCount}>
              {filtered ? "Nothing matches these filters." : `No ${def.plural.toLowerCase()} yet. Create the first one.`}
            </EmptyRow>
          )}
          {rows.map((row, index) => {
            const id = String(row.id);
            const title = String(row[def.titleColumn] ?? "Untitled");
            const published = isPublished(def, row);
            const group = groupOf(row);
            const position = seen.get(group) ?? 0;
            seen.set(group, position + 1);
            const newGroup = def.group && (index === 0 || groupOf(rows[index - 1]) !== group);
            const canDelete = canDeletePublished || (def.deleteRule === "drafts-or-admin" && !published);
            return (
              <Fragment key={id}>
                {newGroup && def.group && (
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={colCount}
                      className="border-b border-line bg-paper px-4 py-2 text-left text-sm font-semibold text-ink"
                    >
                      {def.group.labels[group] ?? group}
                    </th>
                  </tr>
                )}
                <tr>
                  <Td className="font-medium text-ink">
                    <Link href={`${def.adminPath}/${id}`} className="hover:underline">
                      {title}
                    </Link>
                    {rowLinks?.(row).map((link) => (
                      <Link key={link.href} href={link.href} className="ml-3 text-xs font-normal text-ink/65 underline underline-offset-2 hover:text-ink">
                        {link.label}
                      </Link>
                    ))}
                  </Td>
                  {def.listColumns.map((column) => (
                    <Td key={column.label}>
                      {column.value(row)}
                    </Td>
                  ))}
                  <Td>
                    <Pill tone={published ? "good" : "neutral"}>{publishLabel(def, row)}</Pill>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {def.orderable && !filtered && (
                        <>
                          <ActionButton
                            bare
                            title={`Move ${title} up`}
                            disabled={position === 0}
                            action={moveEntity.bind(null, def.key, id, "up")}
                          >
                            <ChevronUp size={16} />
                          </ActionButton>
                          <ActionButton
                            bare
                            title={`Move ${title} down`}
                            disabled={position === (groupSizes.get(group) ?? 1) - 1}
                            action={moveEntity.bind(null, def.key, id, "down")}
                          >
                            <ChevronDown size={16} />
                          </ActionButton>
                        </>
                      )}
                      <ActionButton
                        bare
                        title={published ? `Hide ${title} from the site` : `Show ${title} on the site`}
                        action={setEntityPublished.bind(null, def.key, id, !published)}
                      >
                        {published ? <EyeOff size={16} /> : <Eye size={16} />}
                      </ActionButton>
                      <Link
                        href={`${def.adminPath}/${id}`}
                        title={`Edit ${title}`}
                        aria-label={`Edit ${title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink/65 hover:bg-ink/5 hover:text-ink"
                      >
                        <Pencil size={15} />
                      </Link>
                      <ActionButton
                        bare
                        danger
                        title={canDelete ? `Delete ${title}` : "Only an admin can delete a published item"}
                        disabled={!canDelete}
                        action={deleteEntity.bind(null, def.key, id)}
                        confirm={{
                          title: `Delete ${def.singular.toLowerCase()}?`,
                          body: `"${title}" will be removed permanently. This can't be undone.`,
                          confirmLabel: "Delete",
                        }}
                      >
                        <Trash2 size={15} />
                      </ActionButton>
                    </div>
                  </Td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </Table>

      {def.orderable ? (
        filtered && <p className="mt-3 text-sm text-ink/60">Clear the filters to reorder.</p>
      ) : (
        <Pagination base={def.adminPath} params={params} page={page} pageSize={PAGE_SIZE} total={count ?? rows.length} />
      )}
    </AdminPage>
  );
}

/** The create / edit page for one content type. */
export async function EntityFormPage({
  entity,
  id,
  aside,
}: {
  entity: EntityKey;
  id?: string;
  /** Extra panels shown under the form on the edit page. */
  aside?: (row: Row) => React.ReactNode;
}) {
  const def = definition(entity);
  const ctx = await requireCapability(def.cap, def.adminPath);

  let row: Row | null = null;
  if (id) {
    const { data } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    row = data as Row;
  }

  const title = row ? String(row[def.titleColumn] ?? def.singular) : `New ${def.singular.toLowerCase()}`;

  return (
    <AdminPage
      title={title}
      crumbs={[{ label: def.plural, href: def.adminPath }, { label: row ? "Edit" : "New" }]}
      actions={
        row && (
          <LinkButton href={def.viewHref(row)} variant="secondary" size="sm">
            <ExternalLink size={14} /> Preview on site
          </LinkButton>
        )
      }
    >
      <Panel>
        <AdminForm
          action={saveEntity.bind(null, def.key, id ?? null)}
          submitLabel={row ? "Save changes" : `Create ${def.singular.toLowerCase()}`}
          secondary={
            <Link href={def.adminPath} className="text-sm text-ink/70 underline underline-offset-2 hover:text-ink">
              Cancel
            </Link>
          }
        >
          <EntityFields fields={def.fields} values={row} />
        </AdminForm>
      </Panel>
      {row && aside && <div className="mt-6">{aside(row)}</div>}
    </AdminPage>
  );
}
