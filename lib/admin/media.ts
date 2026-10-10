import type { AdminContext } from "./guard";
import { BUCKETS, type BucketId } from "./storage";

export type MediaFile = {
  bucket: BucketId;
  path: string;
  url: string;
  bytes: number | null;
  type: string | null;
  createdAt: string | null;
};

type Entry = { name: string; id: string | null; created_at?: string | null; metadata?: { size?: number; mimetype?: string } | null };

/**
 * Every file in a bucket, newest first. Project images live one folder deep
 * (one folder per member), so folders are opened once.
 */
export async function listBucket(ctx: AdminContext, bucket: BucketId): Promise<MediaFile[]> {
  const storage = ctx.supabase.storage.from(bucket);
  const options = { limit: 200, sortBy: { column: "created_at", order: "desc" } } as const;
  const { data: top } = await storage.list("", options);
  const files: MediaFile[] = [];

  const add = (entry: Entry, prefix: string) => {
    const path = `${prefix}${entry.name}`;
    files.push({
      bucket,
      path,
      url: storage.getPublicUrl(path).data.publicUrl,
      bytes: entry.metadata?.size ?? null,
      type: entry.metadata?.mimetype ?? null,
      createdAt: entry.created_at ?? null,
    });
  };

  const folders: string[] = [];
  for (const entry of (top ?? []) as Entry[]) {
    if (entry.id === null) folders.push(entry.name);
    else if (entry.name !== ".emptyFolderPlaceholder") add(entry, "");
  }
  await Promise.all(
    folders.slice(0, 60).map(async (folder) => {
      const { data } = await storage.list(folder, options);
      for (const entry of (data ?? []) as Entry[]) if (entry.id !== null) add(entry, `${folder}/`);
    }),
  );

  return files.sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
}

/** Where each stored image URL is used on the site: url -> short description. */
export async function mediaUsage(ctx: AdminContext): Promise<Map<string, string>> {
  const usage = new Map<string, string>();
  const note = (url: unknown, where: string) => {
    if (typeof url === "string" && url) usage.set(url.split("?")[0], where);
  };

  const [people, projects, events, settings, seo] = await Promise.all([
    ctx.supabase.from("org_people").select("full_name, photo_path"),
    ctx.supabase.from("projects").select("title, image_path"),
    ctx.supabase.from("events").select("title, poster_path"),
    ctx.supabase.from("organization_settings").select("logo_path, favicon_path, og_image_path").eq("id", true).maybeSingle(),
    ctx.supabase.from("site_content").select("value").eq("key", "seo.pages").maybeSingle(),
  ]);

  for (const p of people.data ?? []) note(p.photo_path, `team profile: ${p.full_name}`);
  for (const p of projects.data ?? []) note(p.image_path, `project: ${p.title}`);
  for (const e of events.data ?? []) note(e.poster_path, `event: ${e.title}`);
  note(settings.data?.logo_path, "site logo");
  note(settings.data?.favicon_path, "favicon");
  note(settings.data?.og_image_path, "default share image");
  for (const [page, value] of Object.entries((seo.data?.value ?? {}) as Record<string, { ogImage?: string }>)) {
    note(value?.ogImage, `share image: ${page} page`);
  }
  return usage;
}

export const MEDIA_BUCKETS = Object.keys(BUCKETS) as BucketId[];
