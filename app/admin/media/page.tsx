import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteMedia, uploadMedia } from "@/actions/admin-media";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, Field, SelectField } from "@/components/admin/admin-form";
import { AdminPage, Panel, Pill, formatDate, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { MEDIA_BUCKETS, listBucket, mediaUsage } from "@/lib/admin/media";
import { BUCKETS, type BucketId } from "@/lib/admin/storage";

export const metadata: Metadata = { title: "Admin: Media library" };

const size = (bytes: number | null) =>
  bytes === null ? "" : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default async function MediaPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("media", "/admin/media");
  const params = await searchParams;
  const requested = param(params, "bucket") as BucketId;
  const bucket: BucketId = MEDIA_BUCKETS.includes(requested) ? requested : "team-photos";

  const [files, usage] = await Promise.all([listBucket(ctx, bucket), mediaUsage(ctx)]);
  const rules = BUCKETS[bucket];

  return (
    <AdminPage
      title="Media library"
      description="Images stored for the site. An image that is in use has to be removed where it is used before it can be deleted."
      crumbs={[{ label: "Media library" }]}
    >
      <nav aria-label="Libraries" className="mb-6 flex flex-wrap gap-2">
        {MEDIA_BUCKETS.map((id) => (
          <Link
            key={id}
            href={`/admin/media?bucket=${id}`}
            aria-current={id === bucket ? "page" : undefined}
            className={`border px-3.5 py-1.5 text-sm ${
              id === bucket ? "border-accent bg-accent-soft font-medium text-ink" : "border-ink/25 text-ink/75 hover:border-ink"
            }`}
          >
            {BUCKETS[id].label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Upload"
          description="Team photos and site assets can be added here. Event covers and project images are added from their own forms."
        >
          <AdminForm action={uploadMedia} submitLabel="Upload" warnUnsaved={false}>
            <SelectField
              name="bucket"
              label="Library"
              defaultValue={bucket === "site-assets" ? "site-assets" : "team-photos"}
              options={[
                { value: "team-photos", label: BUCKETS["team-photos"].label },
                { value: "site-assets", label: BUCKETS["site-assets"].label },
              ]}
            />
            <Field name="file" label="Image" hint="JPEG, PNG or WEBP, up to 2MB.">
              <input
                id="file"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/x-icon"
                className="block w-full text-sm text-ink/80 file:mr-3 file:cursor-pointer file:border file:border-ink/30 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
              />
            </Field>
          </AdminForm>
        </Panel>

        <section className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink/65">
            {files.length} file{files.length === 1 ? "" : "s"} in {rules.label.toLowerCase()}. Limit {rules.maxBytes / (1024 * 1024)}MB each.
          </p>
          {files.length === 0 ? (
            <p className="border border-dashed border-ink/20 bg-surface px-6 py-12 text-sm text-ink/60">Nothing stored here yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file) => {
                const usedBy = usage.get(file.url);
                return (
                  <li key={file.path} className="border border-line bg-surface">
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-paper">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnails of arbitrary sizes */}
                      <img src={file.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </a>
                    <div className="p-3">
                      <p className="break-all text-xs text-ink/80">{file.path}</p>
                      <p className="mt-1 text-xs text-ink/55">
                        {[size(file.bytes), formatDate(file.createdAt)].filter(Boolean).join(", ")}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {usedBy ? <Pill tone="good">In use</Pill> : <Pill>Not in use</Pill>}
                        <ActionButton
                          bare
                          danger
                          disabled={Boolean(usedBy)}
                          title={usedBy ? `In use by ${usedBy}` : `Delete ${file.path}`}
                          action={deleteMedia.bind(null, file.bucket, file.path)}
                          confirm={{
                            title: "Delete this file?",
                            body: "It is removed from storage permanently.",
                            confirmLabel: "Delete",
                          }}
                        >
                          <Trash2 size={15} />
                        </ActionButton>
                      </div>
                      {usedBy && <p className="mt-1.5 text-xs text-ink/65">Used by {usedBy}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
