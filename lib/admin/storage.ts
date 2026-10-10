import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ICON_TYPES = [...IMAGE_TYPES, "image/x-icon", "image/vnd.microsoft.icon"];

/** The site's storage buckets and the limits enforced on each (see migration 0009). */
export const BUCKETS = {
  "team-photos": { label: "Team photos", maxBytes: 2 * 1024 * 1024, types: IMAGE_TYPES },
  "site-assets": { label: "Site assets", maxBytes: 2 * 1024 * 1024, types: ICON_TYPES },
  "event-posters": { label: "Event covers", maxBytes: 4 * 1024 * 1024, types: IMAGE_TYPES },
  "project-images": { label: "Project images", maxBytes: 4 * 1024 * 1024, types: IMAGE_TYPES },
} as const;

export type BucketId = keyof typeof BUCKETS;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export function isUpload(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

/** The object path inside `bucket` for one of its public URLs, or null. */
export function pathFromPublicUrl(url: string | null | undefined, bucket: BucketId): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
}

/**
 * Validates and uploads an image, returning its public URL. Every upload gets
 * a new, timestamped object name, so a replaced image can never be served
 * from a cache under the old URL.
 */
export async function uploadImage(
  supabase: Supabase,
  bucket: BucketId,
  file: File,
  name: string,
): Promise<{ url: string } | { error: string }> {
  const rules = BUCKETS[bucket];
  if (!(rules.types as readonly string[]).includes(file.type)) {
    return { error: `That file type isn't allowed here. Use ${rules.types.map((t) => EXTENSIONS[t].toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.` };
  }
  if (file.size > rules.maxBytes) {
    return { error: `That file is too large. The limit is ${rules.maxBytes / (1024 * 1024)}MB.` };
  }

  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
  const path = `${safe}-${Date.now()}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Could not upload the image. Please try again." };
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** Deletes the object behind one of `bucket`'s public URLs. Ignores anything else. */
export async function removeByUrl(supabase: Supabase, bucket: BucketId, url: string | null | undefined) {
  const path = pathFromPublicUrl(url, bucket);
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error("storage remove failed:", bucket, path, error.message);
}
