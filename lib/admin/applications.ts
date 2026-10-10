import type { AdminContext } from "./guard";

export const APPLICATION_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

export type ApplicationFilters = { q?: string; status?: string; department?: string; from?: string; to?: string };

const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/**
 * The filtered applications query, shared by the list page and the CSV
 * export so both always return the same rows. Dates are India-time days.
 */
export function applicationsQuery(ctx: AdminContext, filters: ApplicationFilters, columns = "*") {
  let query = ctx.supabase.from("applications").select(columns, { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.department) query = query.ilike("department", `%${filters.department.replace(/[%,()]/g, " ")}%`);
  if (filters.q) {
    const safe = filters.q.replace(/[,()%*\\]/g, " ").trim();
    query = query.or(`full_name.ilike.%${safe}%,college_email.ilike.%${safe}%`);
  }
  if (isDate(filters.from)) query = query.gte("created_at", `${filters.from}T00:00:00+05:30`);
  if (isDate(filters.to)) query = query.lte("created_at", `${filters.to}T23:59:59+05:30`);
  return query.order("created_at", { ascending: false });
}
