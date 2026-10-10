"use server";

import { revalidatePath } from "next/cache";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { BUCKETS, isUpload, uploadImage, type BucketId } from "@/lib/admin/storage";
import { mediaUsage } from "@/lib/admin/media";

/** Buckets the media library may upload to directly. */
const UPLOAD_BUCKETS: BucketId[] = ["site-assets", "team-photos"];

export async function uploadMedia(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("media");
  if (!ctx) return FORBIDDEN;

  const bucket = formData.get("bucket") as BucketId;
  if (!UPLOAD_BUCKETS.includes(bucket)) return fail("Choose where to upload.", { bucket: "Choose a library" });
  const file = formData.get("file");
  if (!isUpload(file)) return fail("Choose a file to upload.", { file: "Choose a file" });

  const result = await uploadImage(ctx.supabase, bucket, file, file.name.replace(/\.[^.]+$/, ""));
  if ("error" in result) return fail("Please fix the highlighted fields.", { file: result.error });

  await logAudit(ctx, { action: "uploaded", table: `storage.${bucket}`, after: { url: result.url, bytes: file.size } });
  revalidatePath("/admin/media");
  return ok("Image uploaded.");
}

export async function deleteMedia(bucket: string, path: string): Promise<ActionState> {
  const ctx = await authorize("media");
  if (!ctx) return FORBIDDEN;
  if (!Object.prototype.hasOwnProperty.call(BUCKETS, bucket) || !path || path.includes("..")) return fail("Unknown file.");

  const url = ctx.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const usage = await mediaUsage(ctx);
  if (usage.has(url)) return fail(`This image is in use (${usage.get(url)}). Remove it there first.`);

  const { data, error } = await ctx.supabase.storage.from(bucket).remove([path]);
  if (error || !data?.length) return fail("Could not delete this file.");

  await logAudit(ctx, { action: "deleted", table: `storage.${bucket}`, before: { path }, after: null });
  revalidatePath("/admin/media");
  return ok("File deleted.");
}
