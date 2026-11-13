import { renderCertificate, CertificateError } from "@/lib/certificates/pdf";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createClient } from "@/lib/supabase/server";

/**
 * A contribution certificate (migration 0044), with the existing certificate design: for its holder
 * once an admin issued it, and for admins. It lists the verified contributions, with a QR and link to
 * /verify/<code>.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^FXC-[0-9A-F]{8}$/.test(code)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Please sign in.", { status: 401 });
  // RLS: the holder sees it once issued; Command Center operators always.
  const { data: cert } = await supabase.from("certificate_verifications").select("*").eq("code", code).maybeSingle();
  if (!cert || cert.status === "revoked") return new Response("Not found", { status: 404 });
  const settings = await getOrganizationSettings();
  const items = (cert.contributions as { title: string; mission: string | null }[]) ?? [];
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
  try {
    const bytes = await renderCertificate({
      organization: settings.chapter_name,
      subtitle: settings.subtitle,
      title: "Certificate of Contribution",
      attendee: cert.holder as string,
      eventTitle: `${items.length} verified contribution${items.length === 1 ? "" : "s"}: ${items.slice(0, 4).map((i) => i.title).join("; ")}${items.length > 4 ? "; …" : ""}`,
      eventDate: ((cert.issued_at as string | null) ?? new Date().toISOString()).slice(0, 10),
      venue: cert.period_label as string,
      serial: code,
      issuedAt: (cert.issued_at as string | null) ?? new Date().toISOString(),
      verifyUrl: `${site}/verify/${code}`,
      signatories: [],
    });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${code}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CertificateError) return new Response(e.message, { status: 422 });
    throw e;
  }
}
