import { NextResponse } from "next/server";
import { CertificateError, renderCertificate } from "@/lib/certificates/pdf";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Downloads one certificate as a PDF, generated on the spot.
 *
 * Who may: the attendee it belongs to, and staff. That is decided by row
 * level security: the registration is read with the caller's own session, so
 * anyone else simply gets "not found". Only once that has passed is the
 * service-role client used, for the two things the attendee's own session
 * may not read: the event if it has since been unpublished, and the private
 * signature images.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/profile/events");
    return NextResponse.redirect(login);
  }

  const { data: registration } = await supabase
    .from("event_registrations")
    .select("id, status, event_id, certificate_serial, certificate_name, certificate_issued_at")
    .eq("id", id)
    .maybeSingle();
  if (!registration || registration.status !== "attended" || !registration.certificate_serial) {
    return new Response("Not found", { status: 404 });
  }

  const trusted = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;
  const { data: event } = await (trusted ?? supabase)
    .from("events")
    .select("*")
    .eq("id", registration.event_id)
    .maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });

  const signature = async (stored: unknown): Promise<Uint8Array | null> => {
    if (!trusted || typeof stored !== "string" || !stored) return null;
    const { data } = await trusted.storage.from("certificate-assets").download(stored);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };

  const signatories = (
    await Promise.all(
      [1, 2].map(async (n) => {
        const name = event[`signatory_${n}_name`] as string | null;
        if (!name?.trim()) return null;
        return {
          name,
          title: (event[`signatory_${n}_title`] as string | null) ?? null,
          signature: await signature(event[`signatory_${n}_signature_path`]),
        };
      }),
    )
  ).filter((s) => s !== null);

  const settings = await getOrganizationSettings();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const serial = String(registration.certificate_serial);

  try {
    const pdf = await renderCertificate({
      organization: settings.chapter_name,
      subtitle: settings.subtitle,
      title: String(event.certificate_title || "Certificate of Participation"),
      attendee: String(registration.certificate_name ?? ""),
      eventTitle: String(event.title),
      eventDate: String(event.event_date),
      venue: (event.venue as string | null) ?? null,
      serial,
      issuedAt: String(registration.certificate_issued_at ?? new Date().toISOString()),
      verifyUrl: `${site}/verify/${serial}`,
      signatories,
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="FusionX-certificate-${serial}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof CertificateError) return new Response(error.message, { status: 422 });
    console.error("certificate render failed:", error);
    return new Response("The certificate could not be generated. Please try again.", { status: 500 });
  }
}
