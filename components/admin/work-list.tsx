import Link from "next/link";
import { Eye, EyeOff, Pencil, Star, Trash2 } from "lucide-react";
import { deleteWork, setProjectFeatured, setWorkPublished } from "@/actions/admin-moderation";
import { requireCapability } from "@/lib/admin/guard";
import { ActionButton } from "./action-button";
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
} from "./ui";

const PAGE_SIZE = 20;

const KINDS = {
  projects: {
    table: "projects",
    title: "Projects",
    singular: "project",
    owner: "owner_id",
    description: "Everything members have created, drafts included. Feature a project to show it first on the home page.",
  },
  research: {
    table: "research",
    title: "Research",
    singular: "research entry",
    owner: "created_by",
    description: "Every research entry, drafts included.",
  },
} as const;

/** Moderation list for members' projects or research entries. */
export async function WorkListPage({
  kind,
  searchParams,
}: {
  kind: keyof typeof KINDS;
  searchParams: Promise<ListParams>;
}) {
  const def = KINDS[kind];
  const base = `/admin/${kind}`;
  const ctx = await requireCapability("moderation", base);
  const params = await searchParams;
  const page = pageOf(params);
  const q = param(params, "q");
  const status = param(params, "status");
  const canDelete = ctx.caps.includes("moderation.delete");

  let query = ctx.supabase.from(def.table).select("*", { count: "exact" });
  if (q) query = query.or(searchFilter(["title", "domain"], q));
  if (status === "published") query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);
  if (status === "featured" && kind === "projects") query = query.eq("is_featured", true);
  const { data, count } = await query
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Record<string, unknown>[];

  const ownerIds = [...new Set(rows.map((r) => r[def.owner]).filter(Boolean))] as string[];
  const { data: owners } = ownerIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name]));

  return (
    <AdminPage title={def.title} description={def.description} crumbs={[{ label: def.title }]}>
      <Toolbar
        base={base}
        params={params}
        searchPlaceholder={`Search ${def.title.toLowerCase()}`}
        filters={[
          {
            name: "status",
            label: "Show",
            options: [
              { value: "published", label: "Published" },
              { value: "draft", label: "Drafts" },
              ...(kind === "projects" ? [{ value: "featured", label: "Featured" }] : []),
            ],
          },
        ]}
      />
      <Table label={def.title}>
        <thead>
          <tr>
            <Th>Title</Th>
            <Th>Owner</Th>
            <Th>Stage</Th>
            <Th>Updated</Th>
            <Th>Visibility</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={6}>Nothing here yet.</EmptyRow>}
          {rows.map((row) => {
            const id = String(row.id);
            const title = String(row.title);
            const published = Boolean(row.is_published);
            const featured = Boolean(row.is_featured);
            const owner = String(row[def.owner] ?? "");
            return (
              <tr key={id}>
                <Td className="font-medium text-ink">
                  {title}
                  {row.domain ? <span className="block text-xs font-normal text-ink/60">{String(row.domain)}</span> : null}
                </Td>
                <Td>
                  {ctx.caps.includes("users") ? (
                    <Link href={`/admin/users/${owner}`} className="hover:underline">
                      {ownerName.get(owner) ?? "Unknown"}
                    </Link>
                  ) : (
                    (ownerName.get(owner) ?? "Unknown")
                  )}
                </Td>
                <Td className="capitalize">{String(row.status ?? "")}</Td>
                <Td className="whitespace-nowrap">{formatDate(row.updated_at as string)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Pill tone={published ? "good" : "neutral"}>{published ? "Published" : "Draft"}</Pill>
                    {featured && <Pill tone="good">Featured</Pill>}
                  </div>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    {kind === "projects" && (
                      <ActionButton
                        bare
                        title={featured ? `Stop featuring ${title}` : `Feature ${title} on the home page`}
                        action={setProjectFeatured.bind(null, id, !featured)}
                      >
                        <Star size={16} fill={featured ? "currentColor" : "none"} />
                      </ActionButton>
                    )}
                    <ActionButton
                      bare
                      title={published ? `Unpublish ${title}` : `Publish ${title}`}
                      action={setWorkPublished.bind(null, kind, id, !published)}
                    >
                      {published ? <EyeOff size={16} /> : <Eye size={16} />}
                    </ActionButton>
                    <Link
                      href={`/${kind}/${id}/edit`}
                      title={`Edit ${title}`}
                      aria-label={`Edit ${title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink/65 hover:bg-ink/5 hover:text-ink"
                    >
                      <Pencil size={15} />
                    </Link>
                    <ActionButton
                      bare
                      danger
                      disabled={!canDelete}
                      title={canDelete ? `Delete ${title}` : "Only an admin can delete a member's work"}
                      action={deleteWork.bind(null, kind, id)}
                      confirm={{
                        title: `Delete this ${def.singular}?`,
                        body: `"${title}" will be removed permanently, for its owner too. This can't be undone.`,
                        confirmLabel: "Delete",
                      }}
                    >
                      <Trash2 size={15} />
                    </ActionButton>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination base={base} params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </AdminPage>
  );
}
