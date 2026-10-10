"use server";

import { revalidatePath } from "next/cache";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { isUpload, removeByUrl, uploadImage } from "@/lib/admin/storage";
import { CONTENT, HOME_SECTIONS, SEO_PAGES, withFallback, type ContentKey } from "@/lib/site-content/schema";

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function json(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(text(formData, name));
  } catch {
    return null;
  }
}

/** Builds each key's value from its form. Field names are the value's own paths. */
const READERS: { [K in ContentKey]: (formData: FormData, existing: unknown) => unknown } = {
  "home.hero": (f) => ({
    eyebrow: text(f, "eyebrow"),
    // Normalised to \n so the stored value is the same on every platform.
    headline: text(f, "headline").replace(/\r\n/g, "\n"),
    highlight: text(f, "highlight"),
    description: text(f, "description"),
    primaryCta: { label: text(f, "primaryCta.label"), href: text(f, "primaryCta.href") },
    secondaryCta: { label: text(f, "secondaryCta.label"), href: text(f, "secondaryCta.href") },
  }),
  "home.sections": (f) => Object.fromEntries(HOME_SECTIONS.map((s) => [s.key, f.get(s.key) === "on"])),
  "about.page": (f) => ({ mission: text(f, "mission"), vision: text(f, "vision"), why: text(f, "why") }),
  "lists.pipeline": (f) => json(f, "value"),
  "lists.journey": (f) => json(f, "value"),
  "lists.core_areas": (f) => json(f, "value"),
  "footer.columns": (f) => json(f, "value"),
  "seo.default": (f) => ({
    defaultTitle: text(f, "defaultTitle"),
    titleTemplate: text(f, "titleTemplate"),
    description: text(f, "description"),
  }),
  "seo.pages": (f, existing) => {
    const previous = (existing ?? {}) as Record<string, { ogImage?: string }>;
    return Object.fromEntries(
      SEO_PAGES.map((page) => [
        page.key,
        {
          title: text(f, `${page.key}.title`).trim(),
          description: text(f, `${page.key}.description`).trim(),
          // Uploads are resolved by the action; start from what is stored.
          ogImage: previous[page.key]?.ogImage ?? "",
        },
      ]),
    );
  },
};

const VIEW: Partial<Record<ContentKey, string>> = { "about.page": "/about" };
const LIST_KEYS: ContentKey[] = ["lists.pipeline", "lists.journey", "lists.core_areas", "footer.columns"];

/**
 * Saves one key of the content store. Editors may save 'content' keys,
 * admins 'settings' keys too; the database policies enforce the same split.
 */
export async function saveContent(key: ContentKey, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!Object.prototype.hasOwnProperty.call(CONTENT, key)) return fail("Unknown content.");
  const entry = CONTENT[key];
  const ctx = await authorize(entry.scope === "settings" ? "settings" : "content");
  if (!ctx) return FORBIDDEN;

  const { data: row } = await ctx.supabase.from("site_content").select("value").eq("key", key).maybeSingle();
  const existing = row?.value ?? null;

  const value = READERS[key](formData, existing) as Record<string, { ogImage?: string }>;

  // Per-page share images.
  const uploaded: string[] = [];
  const replaced: string[] = [];
  if (key === "seo.pages") {
    for (const page of SEO_PAGES) {
      const field = `${page.key}.ogImage`;
      const file = formData.get(field);
      const previous = value[page.key].ogImage || "";
      if (isUpload(file)) {
        const result = await uploadImage(ctx.supabase, "site-assets", file, `og-${page.key}`);
        if ("error" in result) {
          for (const url of uploaded) await removeByUrl(ctx.supabase, "site-assets", url);
          return fail("Please fix the highlighted fields.", { [field]: result.error });
        }
        value[page.key].ogImage = result.url;
        uploaded.push(result.url);
        if (previous) replaced.push(previous);
      } else if (formData.get(`${field}__remove`) === "on" && previous) {
        value[page.key].ogImage = "";
        replaced.push(previous);
      }
    }
  }

  // A cleared text field means "use the original": fill it from the default
  // before validating. Lists and per-page SEO are taken exactly as submitted.
  const candidate = LIST_KEYS.includes(key) || key === "seo.pages" ? value : withFallback(entry.fallback, value);
  const parsed = entry.schema.safeParse(candidate);
  if (!parsed.success) {
    for (const url of uploaded) await removeByUrl(ctx.supabase, "site-assets", url);
    const errors = zodFieldErrors(parsed.error);
    // List editors submit one JSON field; show their first problem on it.
    const fieldErrors = LIST_KEYS.includes(key) ? { value: Object.values(errors)[0] ?? "Check this list." } : errors;
    return fail("Please fix the highlighted fields.", fieldErrors);
  }

  const { error } = await ctx.supabase
    .from("site_content")
    .upsert({ key, scope: entry.scope, value: parsed.data, updated_by: ctx.user.id }, { onConflict: "key" });
  if (error) {
    for (const url of uploaded) await removeByUrl(ctx.supabase, "site-assets", url);
    console.error("save site_content failed:", key, error.message);
    return fail("Could not save. Please try again.");
  }
  for (const url of replaced) await removeByUrl(ctx.supabase, "site-assets", url);

  await logAudit(ctx, {
    action: "updated",
    table: "site_content",
    id: key,
    before: existing === null ? null : { value: existing },
    after: { value: parsed.data },
  });
  revalidatePath("/", "layout");
  return ok("Saved.", { viewHref: VIEW[key] ?? "/" });
}

/** Removes a key's stored value, returning it to the copy the site shipped with. */
export async function resetContent(key: ContentKey): Promise<ActionState> {
  if (!Object.prototype.hasOwnProperty.call(CONTENT, key)) return fail("Unknown content.");
  // Deleting a row is admin-only in the database, whatever the key's scope.
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;

  const { data: row } = await ctx.supabase.from("site_content").select("value").eq("key", key).maybeSingle();
  if (!row) return ok("Already using the original text.");
  const { error } = await ctx.supabase.from("site_content").delete().eq("key", key);
  if (error) return fail("Could not reset. Please try again.");

  await logAudit(ctx, { action: "reset", table: "site_content", id: key, before: { value: row.value }, after: null });
  revalidatePath("/", "layout");
  return ok("Reset to the original text.", { viewHref: VIEW[key] ?? "/" });
}
