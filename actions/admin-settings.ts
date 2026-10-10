"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, FORBIDDEN, type AdminContext } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { isUpload, removeByUrl, uploadImage } from "@/lib/admin/storage";

/**
 * Writes to the organization_settings singleton. All of these need the
 * "settings" capability (admin or super admin); the row's update policy says
 * the same. Maintenance mode is not here: it is a super admin switch and
 * lives in actions/admin-danger.ts.
 */

type Row = Record<string, unknown>;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || (/^https?:\/\//i.test(v) && URL.canParse(v)), "Enter a full link starting with https://");

/** An internal path or an http(s) URL, or empty. */
const optionalHref = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), "Use a path like /events or a full https:// link");

/** A datetime-local value, read as India time, or empty. */
const optionalDateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Enter a valid date and time");

const toIso = (local: string) => (local ? new Date(`${local}:00+05:30`).toISOString() : null);
const nullable = (value: string) => (value === "" ? null : value);
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

async function current(ctx: AdminContext): Promise<Row | null> {
  const { data } = await ctx.supabase.from("organization_settings").select("*").eq("id", true).maybeSingle();
  return (data as Row | null) ?? null;
}

async function write(ctx: AdminContext, before: Row | null, values: Row, action: string): Promise<ActionState | null> {
  const { data: after, error } = await ctx.supabase
    .from("organization_settings")
    .update({ ...values, updated_by: ctx.user.id })
    .eq("id", true)
    .select("*")
    .maybeSingle();
  if (error || !after) {
    if (error) console.error("update organization_settings failed:", error.message);
    return fail("Could not save. Please try again.");
  }
  await logAudit(ctx, { action, table: "organization_settings", id: "settings", before, after: after as Row });
  revalidatePath("/", "layout");
  return null;
}

const identitySchema = z.object({
  chapter_name: z.string().trim().min(2, "Enter the chapter name").max(80),
  subtitle: z.string().trim().min(2, "Enter the subtitle").max(80),
  tagline: z.string().trim().min(2, "Enter the tagline").max(120),
  official_email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  instagram_url: optionalUrl,
  linkedin_url: optionalUrl,
  github_url: optionalUrl,
  institutional_approval: z.enum(["faculty_guide_confirmed", "director_review_pending", "officially_approved"]),
});

const ASSETS = [
  { field: "logo", column: "logo_path", name: "logo" },
  { field: "favicon", column: "favicon_path", name: "favicon" },
  { field: "og_image", column: "og_image_path", name: "share-image" },
] as const;

export async function saveIdentity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;

  const parsed = identitySchema.safeParse(
    Object.fromEntries(Object.keys(identitySchema.shape).map((key) => [key, field(formData, key)])),
  );
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));

  const before = await current(ctx);
  const values: Row = {
    ...parsed.data,
    official_email: nullable(parsed.data.official_email),
    instagram_url: nullable(parsed.data.instagram_url),
    linkedin_url: nullable(parsed.data.linkedin_url),
    github_url: nullable(parsed.data.github_url),
  };

  const uploaded: string[] = [];
  const replaced: string[] = [];
  for (const asset of ASSETS) {
    const file = formData.get(asset.field);
    const previous = (before?.[asset.column] as string | null | undefined) ?? null;
    if (isUpload(file)) {
      const result = await uploadImage(ctx.supabase, "site-assets", file, asset.name);
      if ("error" in result) {
        for (const url of uploaded) await removeByUrl(ctx.supabase, "site-assets", url);
        return fail("Please fix the highlighted fields.", { [asset.field]: result.error });
      }
      values[asset.column] = result.url;
      uploaded.push(result.url);
      if (previous) replaced.push(previous);
    } else if (formData.get(`${asset.field}__remove`) === "on" && previous) {
      values[asset.column] = null;
      replaced.push(previous);
    }
  }

  const failed = await write(ctx, before, values, "updated_identity");
  if (failed) {
    for (const url of uploaded) await removeByUrl(ctx.supabase, "site-assets", url);
    return failed;
  }
  for (const url of replaced) await removeByUrl(ctx.supabase, "site-assets", url);
  return ok("Site identity saved.", { viewHref: "/" });
}

const bannerSchema = z
  .object({
    announcement_banner: z.string().trim().max(200, "Keep the banner under 200 characters"),
    announcement_banner_link: optionalHref,
    announcement_banner_active: z.boolean(),
    announcement_banner_starts_at: optionalDateTime,
    announcement_banner_ends_at: optionalDateTime,
  })
  .refine((v) => !v.announcement_banner_active || v.announcement_banner !== "", {
    path: ["announcement_banner"],
    message: "Write the banner text before switching it on",
  })
  .refine(
    (v) =>
      !v.announcement_banner_starts_at ||
      !v.announcement_banner_ends_at ||
      v.announcement_banner_starts_at < v.announcement_banner_ends_at,
    { path: ["announcement_banner_ends_at"], message: "The end has to be after the start" },
  );

export async function saveBanner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;

  const parsed = bannerSchema.safeParse({
    announcement_banner: field(formData, "announcement_banner"),
    announcement_banner_link: field(formData, "announcement_banner_link"),
    announcement_banner_active: formData.get("announcement_banner_active") === "on",
    announcement_banner_starts_at: field(formData, "announcement_banner_starts_at"),
    announcement_banner_ends_at: field(formData, "announcement_banner_ends_at"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));

  const failed = await write(
    ctx,
    await current(ctx),
    {
      announcement_banner: nullable(parsed.data.announcement_banner),
      announcement_banner_link: nullable(parsed.data.announcement_banner_link),
      announcement_banner_active: parsed.data.announcement_banner_active,
      announcement_banner_starts_at: toIso(parsed.data.announcement_banner_starts_at),
      announcement_banner_ends_at: toIso(parsed.data.announcement_banner_ends_at),
    },
    "updated_banner",
  );
  return failed ?? ok("Announcement banner saved.", { viewHref: "/" });
}

const registrationSchema = z.object({
  join_open: z.boolean(),
  join_closed_message: z.string().trim().max(400, "Keep the message under 400 characters"),
  signup_enabled: z.boolean(),
});

export async function saveRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;

  const parsed = registrationSchema.safeParse({
    join_open: formData.get("join_open") === "on",
    join_closed_message: field(formData, "join_closed_message"),
    signup_enabled: formData.get("signup_enabled") === "on",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));

  const failed = await write(
    ctx,
    await current(ctx),
    {
      join_open: parsed.data.join_open,
      join_closed_message: nullable(parsed.data.join_closed_message),
      signup_enabled: parsed.data.signup_enabled,
    },
    "updated_registration",
  );
  if (!failed) {
    revalidatePath("/join");
    revalidatePath("/signup");
  }
  return failed ?? ok("Registration settings saved.", { viewHref: "/join" });
}
