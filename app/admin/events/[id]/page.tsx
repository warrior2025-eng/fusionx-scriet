import type { Metadata } from "next";
import { Award, ScanLine, Users } from "lucide-react";
import { saveSignature } from "@/actions/admin-events";
import { AdminForm, CheckboxField, Field } from "@/components/admin/admin-form";
import { EntityFormPage } from "@/components/admin/entity-pages";
import { Panel } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { getAdminContext } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "Admin: Edit event" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  const canSign = ctx.caps.includes("certificates");

  // Short-lived links so an admin can see the signature images already uploaded.
  const preview = async (path: unknown) => {
    if (!canSign || typeof path !== "string" || !path) return null;
    const { data } = await ctx.supabase.storage.from("certificate-assets").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };

  return (
    <EntityFormPage
      entity="events"
      id={id}
      aside={async (row) => {
        const slots = await Promise.all(
          ([1, 2] as const).map(async (slot) => ({
            slot,
            name: (row[`signatory_${slot}_name`] as string | null) ?? null,
            has: Boolean(row[`signatory_${slot}_signature_path`]),
            url: await preview(row[`signatory_${slot}_signature_path`]),
          })),
        );
        return (
          <div className="space-y-6">
            <Panel title="Registrations and check-in" description="Who registered, attendance, certificates and the CSV export.">
              <div className="flex flex-wrap gap-3">
                <LinkButton href={`/admin/events/${id}/registrations`} variant="secondary" size="sm">
                  <Users size={15} /> Registrations
                </LinkButton>
                <LinkButton href={`/check-in/${id}`} variant="secondary" size="sm">
                  <ScanLine size={15} /> Open check-in
                </LinkButton>
                <LinkButton href={`/admin/events/${id}/registrations`} variant="secondary" size="sm">
                  <Award size={15} /> Certificates
                </LinkButton>
              </div>
            </Panel>

            {canSign && (
              <Panel
                title="Signature images (optional)"
                description="Certificates print each signatory's name and title as text. Upload a signature image only if that person has agreed to it being used on this event's certificates. Images are stored privately."
              >
                <div className="grid gap-8 sm:grid-cols-2">
                  {slots.map(({ slot, name, has, url }) => (
                    <div key={slot}>
                      <p className="mb-3 text-sm font-semibold text-ink">
                        Signatory {slot}
                        {name ? `: ${name}` : ""}
                      </p>
                      {!name ? (
                        <p className="text-sm text-ink/65">Add this signatory&rsquo;s name in the form above first.</p>
                      ) : (
                        <AdminForm action={saveSignature.bind(null, id, slot)} submitLabel="Save signature" warnUnsaved={false}>
                          {url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt={`Signature of ${name}`} className="h-16 max-w-full border border-line bg-white object-contain p-1" />
                          )}
                          <Field name="signature" label={has ? "Replace image" : "Image"} hint="PNG (transparent background works best) or JPEG, up to 1MB.">
                            <input
                              id="signature"
                              name="signature"
                              type="file"
                              accept="image/png,image/jpeg"
                              className="block w-full text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-ink/30 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-ink"
                            />
                          </Field>
                          <CheckboxField name="permission" label={`${name} has agreed to this signature being used`} />
                          {has && <CheckboxField name="signature__remove" label="Remove the current image" />}
                        </AdminForm>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        );
      }}
    />
  );
}
