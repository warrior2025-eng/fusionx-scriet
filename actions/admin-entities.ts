"use server";

import { revalidatePath } from "next/cache";
import { authorize, FORBIDDEN, type AdminContext } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { getEntity, isPublished, parseEntityForm, type EntityDef } from "@/lib/admin/entities";
import { isUpload, removeByUrl, uploadImage, type BucketId } from "@/lib/admin/storage";

/**
 * Create / update / delete / publish / reorder for every content type in
 * lib/admin/entities.ts. Each action re-checks the caller's permission (the
 * UI is never trusted), validates with Zod, writes an audit entry and
 * revalidates the admin list and the public pages that show the record.
 */

type Row = Record<string, unknown>;

function revalidate(def: EntityDef) {
  revalidatePath(def.adminPath);
  for (const path of def.publicPaths) revalidatePath(path);
}

function mayDelete(def: EntityDef, ctx: AdminContext, row: Row): boolean {
  if (def.deleteRule === "cap") return true;
  if (ctx.caps.includes("content.delete_published")) return true;
  return def.deleteRule === "drafts-or-admin" && !isPublished(def, row);
}

async function nextOrder(ctx: AdminContext, def: EntityDef, values: Row): Promise<number> {
  let query = ctx.supabase.from(def.table).select("display_order").order("display_order", { ascending: false }).limit(1);
  if (def.group) query = query.eq(def.group.column, values[def.group.column] as string);
  const { data } = await query;
  return ((data?.[0]?.display_order as number | undefined) ?? 0) + 1;
}

export async function saveEntity(
  entityKey: string,
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const def = getEntity(entityKey);
  if (!def) return fail("Unknown content type.");
  const ctx = await authorize(def.cap);
  if (!ctx) return FORBIDDEN;

  const parsed = parseEntityForm(def, formData);
  if (!parsed.ok) return fail("Please fix the highlighted fields.", parsed.fieldErrors);
  const values = parsed.values;

  let existing: Row | null = null;
  if (id) {
    const { data } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
    if (!data) return fail(`This ${def.singular.toLowerCase()} no longer exists.`);
    existing = data as Row;
  }

  const invalid = await def.validate?.(values, existing, ctx.supabase);
  if (invalid) return fail("Please fix the highlighted fields.", invalid);

  // Images: upload the new file first; the old one is removed only after the
  // row has been saved, and the new one is removed again if the save fails.
  const uploaded: { bucket: BucketId; url: string }[] = [];
  const replaced: { bucket: BucketId; url: string }[] = [];
  for (const field of def.fields) {
    if (field.type !== "image" || !field.bucket) continue;
    const column = field.column ?? field.name;
    const previous = (existing?.[column] as string | null | undefined) ?? null;
    const file = formData.get(field.name);

    if (isUpload(file)) {
      const result = await uploadImage(ctx.supabase, field.bucket, file, String(values[def.titleColumn] ?? def.key));
      if ("error" in result) {
        for (const u of uploaded) await removeByUrl(ctx.supabase, u.bucket, u.url);
        return fail("Please fix the highlighted fields.", { [field.name]: result.error });
      }
      values[column] = result.url;
      uploaded.push({ bucket: field.bucket, url: result.url });
      if (previous) replaced.push({ bucket: field.bucket, url: previous });
    } else if (formData.get(`${field.name}__remove`) === "on" && previous) {
      values[column] = null;
      replaced.push({ bucket: field.bucket, url: previous });
    }
  }

  def.prepare?.(values, existing);

  if (!existing) {
    if (def.ownerColumn) values[def.ownerColumn] = ctx.user.id;
    if (def.orderable) values.display_order = await nextOrder(ctx, def, values);
  } else if (def.group && existing[def.group.column] !== values[def.group.column]) {
    // Moved to another group: goes to the end of it.
    values.display_order = await nextOrder(ctx, def, values);
  }

  const write = existing
    ? ctx.supabase.from(def.table).update(values).eq("id", id as string).select("*").maybeSingle()
    : ctx.supabase.from(def.table).insert(values).select("*").maybeSingle();
  const { data: saved, error } = await write;

  if (error || !saved) {
    for (const u of uploaded) await removeByUrl(ctx.supabase, u.bucket, u.url);
    if (error?.code === "23505") {
      return fail("Please fix the highlighted fields.", { slug: "That slug is already in use." });
    }
    if (error) console.error(`save ${def.table} failed:`, error.message);
    return fail(`Could not save this ${def.singular.toLowerCase()}. Please try again.`);
  }

  for (const r of replaced) await removeByUrl(ctx.supabase, r.bucket, r.url);

  await logAudit(ctx, {
    action: existing ? "updated" : "created",
    table: def.table,
    id: saved.id as string,
    before: existing,
    after: saved as Row,
  });
  revalidate(def);
  if (existing) revalidatePath(`${def.adminPath}/${id}`);

  return ok(`${def.singular} ${existing ? "saved" : "created"}.`, {
    viewHref: def.viewHref(saved as Row),
    redirectTo: existing ? undefined : def.adminPath,
  });
}

export async function deleteEntity(entityKey: string, id: string): Promise<ActionState> {
  const def = getEntity(entityKey);
  if (!def) return fail("Unknown content type.");
  const ctx = await authorize(def.cap);
  if (!ctx) return FORBIDDEN;

  const { data: existing } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
  if (!existing) return fail(`This ${def.singular.toLowerCase()} no longer exists.`);
  if (!mayDelete(def, ctx, existing as Row)) {
    return fail("Only an admin can delete something that is published. Unpublishing it is always possible.");
  }

  const { data: deleted, error } = await ctx.supabase.from(def.table).delete().eq("id", id).select("id");
  if (error || !deleted?.length) {
    if (error) console.error(`delete ${def.table} failed:`, error.message);
    return fail(`Could not delete this ${def.singular.toLowerCase()}.`);
  }

  for (const field of def.fields) {
    if (field.type === "image" && field.bucket) {
      await removeByUrl(ctx.supabase, field.bucket, existing[field.column ?? field.name] as string | null);
    }
  }

  await logAudit(ctx, { action: "deleted", table: def.table, id, before: existing as Row, after: null });
  revalidate(def);
  return ok(`${def.singular} deleted.`);
}

export async function setEntityPublished(entityKey: string, id: string, publish: boolean): Promise<ActionState> {
  const def = getEntity(entityKey);
  if (!def) return fail("Unknown content type.");
  const ctx = await authorize(def.cap);
  if (!ctx) return FORBIDDEN;

  const { data: existing } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
  if (!existing) return fail(`This ${def.singular.toLowerCase()} no longer exists.`);

  const values: Row =
    def.publish.kind === "status"
      ? { status: publish ? "published" : "draft" }
      : { [def.publish.column]: publish };
  def.prepare?.(values, existing as Row);

  const { data: saved, error } = await ctx.supabase.from(def.table).update(values).eq("id", id).select("*").maybeSingle();
  if (error || !saved) return fail(`Could not update this ${def.singular.toLowerCase()}.`);

  const verb =
    def.publish.kind === "status"
      ? publish ? "published" : "moved to draft"
      : (publish ? def.publish.on : def.publish.off).toLowerCase();
  await logAudit(ctx, {
    action: publish ? "published" : "unpublished",
    table: def.table,
    id,
    before: existing as Row,
    after: saved as Row,
  });
  revalidate(def);
  return ok(`${def.singular} is now ${verb}.`, { viewHref: def.viewHref(saved as Row) });
}

/** Moves a record one place up or down within its list (or its group). */
export async function moveEntity(entityKey: string, id: string, direction: "up" | "down"): Promise<ActionState> {
  const def = getEntity(entityKey);
  if (!def || !def.orderable) return fail("This list can't be reordered.");
  const ctx = await authorize(def.cap);
  if (!ctx) return FORBIDDEN;

  const columns = def.group ? `id, display_order, ${def.group.column}` : "id, display_order";
  const { data: target } = await ctx.supabase.from(def.table).select(columns).eq("id", id).maybeSingle();
  if (!target) return fail(`This ${def.singular.toLowerCase()} no longer exists.`);
  const targetRow = target as unknown as Row;

  let query = ctx.supabase
    .from(def.table)
    .select("id, display_order")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (def.group) query = query.eq(def.group.column, targetRow[def.group.column] as string);
  const { data: siblings } = await query;
  const list = (siblings ?? []) as { id: string; display_order: number }[];

  const from = list.findIndex((row) => row.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) return ok("Already at the edge of the list.");
  [list[from], list[to]] = [list[to], list[from]];

  // Renumber 1..n; only rows whose position changed are written.
  for (let i = 0; i < list.length; i++) {
    if (list[i].display_order !== i + 1) {
      const { error } = await ctx.supabase.from(def.table).update({ display_order: i + 1 }).eq("id", list[i].id);
      if (error) return fail("Could not save the new order.");
    }
  }

  await logAudit(ctx, {
    action: "reordered",
    table: def.table,
    id,
    before: { position: from + 1 },
    after: { position: to + 1 },
  });
  revalidate(def);
  return ok("Order saved.");
}
