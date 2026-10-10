import type { AdminContext } from "./guard";

type Row = Record<string, unknown>;

const SKIP = new Set(["updated_at", "created_at", "updated_by"]);

function brief(value: unknown): unknown {
  if (typeof value === "string") return value.length > 140 ? `${value.slice(0, 140)}…` : value;
  if (Array.isArray(value)) return value.length > 8 ? [...value.slice(0, 8), `+${value.length - 8} more`] : value;
  if (value && typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 200)}…` : value;
  }
  return value;
}

/**
 * A short before/after summary: only the fields that changed. For a create
 * pass `before: null`; for a delete pass `after: null`.
 */
export function summarizeChange(before: Row | null, after: Row | null) {
  const summary: { before?: Row; after?: Row } = {};
  if (before && after) {
    const b: Row = {};
    const a: Row = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (SKIP.has(key)) continue;
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
        b[key] = brief(before[key] ?? null);
        a[key] = brief(after[key] ?? null);
      }
    }
    summary.before = b;
    summary.after = a;
  } else if (after) {
    summary.after = Object.fromEntries(
      Object.entries(after)
        .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== "")
        .map(([k, v]) => [k, brief(v)]),
    );
  } else if (before) {
    summary.before = Object.fromEntries(
      Object.entries(before)
        .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== "")
        .map(([k, v]) => [k, brief(v)]),
    );
  }
  return summary;
}

/**
 * Records an admin write: who, what action, which table and record, and what
 * changed. Every admin server action calls this after its write succeeds. A
 * failure to record is logged server-side but does not undo the write.
 */
export async function logAudit(
  ctx: AdminContext,
  entry: {
    action: string;
    table: string;
    id?: string | null;
    before?: Row | null;
    after?: Row | null;
    note?: string;
  },
) {
  const metadata = {
    ...summarizeChange(entry.before ?? null, entry.after ?? null),
    ...(entry.note ? { note: entry.note } : {}),
  };
  const { error } = await ctx.supabase.from("audit_logs").insert({
    user_id: ctx.user.id,
    action: entry.action,
    resource_type: entry.table,
    resource_id: entry.id ?? null,
    metadata,
  });
  if (error) console.error("audit log write failed:", error.message, entry.action, entry.table);
}
