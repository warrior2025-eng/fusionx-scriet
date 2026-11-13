import type { Metadata } from "next";
import { BadgeCheck, CircleX } from "lucide-react";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { IST, eventDate } from "@/lib/events/format";
import { getOrganizationSettings } from "@/lib/data/organization";
import { createClient } from "@/lib/supabase/server";

// Never indexed: a certificate page is for whoever was handed the link.
export const metadata: Metadata = {
  title: "Verify a certificate",
  robots: { index: false, follow: false, nocache: true },
};

type Certificate = {
  serial: string;
  attendee: string;
  certificate_title: string;
  event_title: string;
  event_date: string;
  issued_at: string;
};

/**
 * Public certificate check. Shows the name, the event and the dates, and
 * nothing else: no email, no department, no account details. An unknown
 * serial and a malformed one look exactly the same.
 */
export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial: raw } = await params;
  const serial = decodeURIComponent(raw).trim().toUpperCase();
  const settings = await getOrganizationSettings();

  // FusionX Autopilot contribution certificates (migration 0044): FXC-XXXXXXXX.
  if (/^FXC-[0-9A-F]{8}$/.test(serial)) return <ContributionCertificate code={serial} organization={settings.chapter_name} />;

  let certificate: Certificate | null = null;
  if (/^FX-\d{4}-\d{6}-[0-9A-F]{4}$/.test(serial)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("verify_certificate", { p_serial: serial });
    certificate = ((data ?? []) as Certificate[])[0] ?? null;
  }

  return (
    <Section className="max-w-2xl pt-16 pb-24">
      <Eyebrow>Certificate verification</Eyebrow>
      {certificate ? (
        <CutCard className="h-auto p-7 md:p-9">
          <p className="flex items-center gap-2.5 text-lg font-semibold text-ink">
            <BadgeCheck size={26} className="text-accent accent-large" aria-hidden /> Valid certificate
          </p>
          <p className="mt-2 text-sm text-ink/70">
            This certificate was issued by {settings.chapter_name} and matches our records.
          </p>
          <dl className="mt-7 space-y-5 border-t border-line pt-7">
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Awarded to</dt>
              <dd className="mt-1 font-serif text-2xl text-ink">{certificate.attendee}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">{certificate.certificate_title}</dt>
              <dd className="mt-1 font-medium text-ink">{certificate.event_title}</dd>
              <dd className="text-sm text-ink/70">{eventDate(certificate.event_date)}</dd>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Certificate no.</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink">{certificate.serial}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Issued</dt>
                <dd className="mt-1 font-medium text-ink">
                  {eventDate(new Date(certificate.issued_at).toLocaleDateString("en-CA", { timeZone: IST }))}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Issued by</dt>
              <dd className="mt-1 font-medium text-ink">{settings.chapter_name}</dd>
            </div>
          </dl>
        </CutCard>
      ) : (
        <CutCard className="h-auto p-7 md:p-9">
          <p className="flex items-center gap-2.5 text-lg font-semibold text-ink">
            <CircleX size={26} className="text-red-600" aria-hidden /> Certificate not found
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink/75">
            We have no certificate with this number. Check that the link or the number was typed exactly as it
            appears on the certificate.
          </p>
        </CutCard>
      )}
    </Section>
  );
}

type Contribution = { code: string; holder: string; period_label: string; contributions: { title: string; mission: string | null; on: string }[]; issued_at: string; revoked: boolean };

/** Holder, verified contributions and issue date, or "revoked". Unknown codes look like the event ones. */
async function ContributionCertificate({ code, organization }: { code: string; organization: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_verify_contribution_certificate", { p_code: code });
  const cert = ((data ?? []) as Contribution[])[0] ?? null;
  return (
    <Section className="max-w-2xl pt-16 pb-24">
      <Eyebrow>Certificate verification</Eyebrow>
      <div data-verify={cert ? (cert.revoked ? "revoked" : "valid") : "unknown"}>
        <CutCard className="h-auto p-7 md:p-9">
          {!cert ? (
            <p className="flex items-center gap-2.5 text-lg font-semibold text-ink"><CircleX size={26} className="text-red-600" aria-hidden /> Certificate not found</p>
          ) : cert.revoked ? (
            <>
              <p className="flex items-center gap-2.5 text-lg font-semibold text-ink"><CircleX size={26} className="text-red-600" aria-hidden /> This certificate was revoked</p>
              <p className="mt-2 text-sm text-ink/70">Certificate {cert.code}, issued to {cert.holder}, is no longer valid.</p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2.5 text-lg font-semibold text-ink"><BadgeCheck size={26} className="text-accent accent-large" aria-hidden /> Valid certificate</p>
              <p className="mt-2 text-sm text-ink/70">Issued by {organization} for verified contributions: each one was reviewed and approved by the team.</p>
              <dl className="mt-7 space-y-5 border-t border-line pt-7">
                <div><dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Awarded to</dt><dd className="mt-1 font-serif text-2xl text-ink">{cert.holder}</dd></div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Contributions · {cert.period_label}</dt>
                  <dd><ul className="mt-1 list-inside list-disc text-ink">{cert.contributions.map((c, i) => <li key={i}>{c.title}{c.mission ? <span className="text-sm text-ink/65"> · {c.mission}</span> : null}</li>)}</ul></dd>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div><dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Certificate no.</dt><dd className="mt-1 font-medium tabular-nums text-ink">{cert.code}</dd></div>
                  <div><dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Issued</dt><dd className="mt-1 font-medium text-ink">{eventDate(new Date(cert.issued_at).toLocaleDateString("en-CA", { timeZone: IST }))}</dd></div>
                </div>
              </dl>
            </>
          )}
        </CutCard>
      </div>
    </Section>
  );
}
