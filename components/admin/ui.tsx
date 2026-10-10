import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Server-rendered building blocks shared by every admin page: the page
 * header with breadcrumbs, the search / filter toolbar (a plain GET form, so
 * it works without JavaScript and every view has a shareable URL), tables,
 * sortable headers, pagination, badges and empty states.
 */

export type Crumb = { label: string; href?: string };

export function AdminPage({
  title,
  description,
  crumbs = [],
  actions,
  children,
}: {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const trail: Crumb[] = [{ label: "Admin", href: "/admin" }, ...crumbs];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-ink/60">
          {trail.map((crumb, i) => (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} aria-hidden className="text-ink/35" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-ink hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/65">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-line bg-surface p-5 sm:p-6", className)}>
      {title && <h2 className="font-serif text-lg text-ink">{title}</h2>}
      {description && <p className="mt-1 text-sm text-ink/65">{description}</p>}
      <div className={cn((title || description) && "mt-5")}>{children}</div>
    </section>
  );
}

// ── list state in the URL ────────────────────────────────────────────────

export type ListParams = Record<string, string | string[] | undefined>;

export function param(params: ListParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function pageOf(params: ListParams): number {
  const n = Number.parseInt(param(params, "page"), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** The current URL's query with some keys replaced (empty values are dropped). */
export function withParams(base: string, params: ListParams, patch: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) query.set(key, v);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") query.delete(key);
    else query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

/** PostgREST `or` filter matching `q` in any of the columns. */
export function searchFilter(columns: string[], q: string): string {
  const safe = q.replace(/[,()%*\\]/g, " ").trim();
  return columns.map((column) => `${column}.ilike.%${safe}%`).join(",");
}

// ── toolbar ──────────────────────────────────────────────────────────────

export type FilterDef = { name: string; label: string; options: { value: string; label: string }[] };

export function Toolbar({
  base,
  params,
  searchPlaceholder = "Search",
  filters = [],
  dateRange,
  children,
}: {
  base: string;
  params: ListParams;
  searchPlaceholder?: string | null;
  filters?: FilterDef[];
  /** Adds From / To date inputs (params `from` and `to`). */
  dateRange?: boolean;
  children?: React.ReactNode;
}) {
  const active = ["q", "from", "to", ...filters.map((f) => f.name)].some((key) => param(params, key));
  return (
    <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-3">
      {param(params, "sort") && <input type="hidden" name="sort" value={param(params, "sort")} />}
      {param(params, "dir") && <input type="hidden" name="dir" value={param(params, "dir")} />}
      {searchPlaceholder !== null && (
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
          <Input
            type="search"
            name="q"
            defaultValue={param(params, "q")}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
      {filters.map((filter) => (
        <label key={filter.name} className="block">
          <span className="mb-1 block text-xs text-ink/60">{filter.label}</span>
          <Select name={filter.name} defaultValue={param(params, filter.name)} className="w-auto min-w-[9rem] py-2">
            <option value="">All</option>
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
      {dateRange && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-ink/60">From</span>
            <Input type="date" name="from" defaultValue={param(params, "from")} className="w-auto py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink/60">To</span>
            <Input type="date" name="to" defaultValue={param(params, "to")} className="w-auto py-2" />
          </label>
        </>
      )}
      <Button type="submit" variant="secondary" size="md">
        Apply
      </Button>
      {active && (
        <Link href={base} className="py-2.5 text-sm text-ink/70 underline underline-offset-2 hover:text-ink">
          Clear
        </Link>
      )}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </form>
  );
}

// ── table ────────────────────────────────────────────────────────────────

export function Table({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table aria-label={label} className="w-full min-w-[36rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  sort,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Makes the header a sort link. */
  sort?: { base: string; params: ListParams; column: string; current: string; ascending: boolean };
}) {
  const classes = cn(
    "border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink/60",
    className,
  );
  if (!sort) return <th scope="col" className={classes}>{children}</th>;
  const active = sort.current === sort.column;
  const nextDir = active && sort.ascending ? "desc" : "asc";
  return (
    <th scope="col" className={classes} aria-sort={active ? (sort.ascending ? "ascending" : "descending") : undefined}>
      <Link
        href={withParams(sort.base, sort.params, { sort: sort.column, dir: nextDir, page: undefined })}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {children}
        {active && (sort.ascending ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />)}
      </Link>
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-line px-4 py-3 align-middle text-ink/85", className)}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-ink/60">
        {children}
      </td>
    </tr>
  );
}

export function Pagination({
  base,
  params,
  page,
  pageSize,
  total,
}: {
  base: string;
  params: ListParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const linkClass = "border border-ink/30 px-3 py-1.5 text-sm text-ink hover:border-ink";
  const offClass = "border border-line px-3 py-1.5 text-sm text-ink/35";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/65">
      <p>
        Showing {first}–{last} of {total}
      </p>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={withParams(base, params, { page: page - 1 })} className={linkClass}>
              Previous
            </Link>
          ) : (
            <span className={offClass}>Previous</span>
          )}
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={withParams(base, params, { page: page + 1 })} className={linkClass}>
              Next
            </Link>
          ) : (
            <span className={offClass}>Next</span>
          )}
        </nav>
      )}
    </div>
  );
}

const TONES = {
  neutral: "border-ink/25 text-ink/75",
  good: "border-accent/45 bg-accent-soft text-ink",
  warn: "border-amber-500/50 bg-amber-500/10 text-ink",
  bad: "border-red-500/50 bg-red-500/10 text-ink",
} as const;

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-xs font-medium capitalize", TONES[tone])}>
      {children}
    </span>
  );
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}
